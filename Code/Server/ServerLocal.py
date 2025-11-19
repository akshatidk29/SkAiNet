import serial
import json
import threading
import requests
import time
from transformers import pipeline

BACKEND_URL = "https://skainet.onrender.com//api/GetMessages"

# ---------- SERIAL CONFIG ----------
SERIAL_PORT = "COM3"
BAUD_RATE = 115200
TIMEOUT = 1

classifier = pipeline(
    "zero-shot-classification",
    model="facebook/bart-large-mnli",
    device=0
)

def analyze_urgency_local(message_text):
    labels = ["HIGH", "MEDIUM", "LOW"]

    result = classifier(
        message_text,
        candidate_labels=labels,
        multi_label=False
    )

    urgency = result["labels"][0]
    return urgency

# ---------- INIT SERIAL ----------
def init_serial():
    try:
        ser = serial.Serial(SERIAL_PORT, baudrate=BAUD_RATE, timeout=TIMEOUT)
        print(f"[INFO] Connected to {SERIAL_PORT}")
        return ser
    except Exception as e:
        print(f"[ERROR] Serial connection failed: {e}")
        return None

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
                        urgency = analyze_urgency_local(message_text)
                        
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
