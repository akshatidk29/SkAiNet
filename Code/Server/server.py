import serial
import json
import threading
import requests
import time
import google.generativeai as genai
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

BACKEND_URL = "https://skainet.onrender.com//api/GetMessages"
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

if not GEMINI_API_KEY:
    print("[ERROR] GEMINI_API_KEY not found in .env file")
    exit(1)

# ---------- SERIAL CONFIG ----------
SERIAL_PORT = "COM3"
BAUD_RATE = 115200
TIMEOUT = 1

# ---------- INIT SERIAL ----------
def init_serial():
    try:
        ser = serial.Serial(SERIAL_PORT, baudrate=BAUD_RATE, timeout=TIMEOUT)
        print(f"[INFO] Connected to {SERIAL_PORT}")
        return ser
    except Exception as e:
        print(f"[ERROR] Serial connection failed: {e}")
        return None

# ---------- GEMINI URGENCY ANALYSIS ----------
def analyze_urgency_with_gemini(message_text):
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        prompt = f"""Analyze this message and determine its urgency level. 
        Respond with ONLY one word: 'HIGH', 'MEDIUM', or 'LOW'.
        
        Message: {message_text}"""
        
        response = model.generate_content(prompt)
        urgency = response.text.strip().upper()
        
        # Validate response
        valid_urgencies = ['HIGH', 'MEDIUM', 'LOW']
        if urgency not in valid_urgencies:
            urgency = 'LOW'
        
        print(f"[GEMINI] Urgency detected: {urgency}")
        return urgency
    except Exception as e:
        print(f"[ERROR] Gemini API call failed: {e}")
        return 'LOW'  # Default to LOW on error

# ---------- SEND TO BACKEND ----------
def send_to_backend(message_data):
    try:
        payload = {
            "logs": [message_data]
        }
        response = requests.post(BACKEND_URL, json=payload, timeout=5)
        if response.status_code == 200:
            print(f"[UPLOADED] Sent message_id={message_data.get('message_id')} with urgency={message_data.get('urgency')}")
        else:
            print(f"[WARN] Upload failed {response.status_code}: {response.text}")
    except Exception as e:
        print(f"[ERROR] Failed to send to backend: {e}")

# ---------- READ LOOP ----------
def read_serial_loop(ser):
    while True:
        try:
            if ser.in_waiting > 0:
                line = ser.readline().decode("utf-8").strip()
                if line:
                    try:
                        data = json.loads(line)
                        message_text = data.get("message", "")
                        
                        # Analyze urgency with Gemini
                        urgency = analyze_urgency_with_gemini(message_text)
                        
                        message = {
                            "source_node": data.get("source_node", 0),
                            "current_node": data.get("current_node", 0),
                            "message_id": data.get("message_id", "0000"),
                            "gps": data.get("gps", {}),
                            "sender_name": data.get("sender_name", ""),
                            "message": message_text,
                            "log_id": int(time.time()),
                            "urgency": urgency
                        }
                        print(f"[NEW MESSAGE] {message['sender_name']} - {message['message'][:40]}...")
                        send_to_backend(message)
                    except json.JSONDecodeError:
                        print(f"[WARNING] Invalid JSON: {line}")
        except Exception as e:
            print(f"[ERROR] Serial read error: {e}")
            time.sleep(2)

# ---------- MAIN ----------
if __name__ == "__main__":
    ser = init_serial()
    if ser:
        thread = threading.Thread(target=read_serial_loop, args=(ser,), daemon=True)
        thread.start()
        print("[INFO] Listening for serial data...")
        while True:
            time.sleep(1)
    else:
        print("[FATAL] Exiting due to serial connection failure.")
