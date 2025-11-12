from flask import Flask, jsonify
from flask_cors import CORS
import serial
import json 
import threading

app = Flask(__name__)
CORS(app)

# Global variables
messages = []
ser = None

# ---------- SERIAL COMMUNICATION ----------
def init_serial():
    """Initialize serial connection to node on COM3"""
    global ser
    try:
        ser = serial.Serial(
            port='COM3',
            baudrate=9600,
            timeout=1
        )
        print(f"[INFO] Serial connection established on COM3")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to connect to COM3: {e}")
        return False

def read_serial_loop():
    """Background thread to read serial data from node"""
    global ser, messages
    
    while True:
        if ser and ser.is_open:
            try:
                if ser.in_waiting > 0:
                    line = ser.readline().decode('utf-8').strip()
                    
                    if line:
                        try:
                            data = json.loads(line)
                            
                            new_message = {
                                "src": str(data.get('source_node', data.get('src', '1'))),
                                "cur": str(data.get('current_node', data.get('cur', '1'))),
                                "msg_id": str(data.get('message_id', data.get('msg_id', '0000'))),
                                "name": data.get('sender_name', data.get('name', '')),
                                "message": data.get('message', ''),
                                "gps": data.get('gps'),
                                "urgency": data.get('urgency')
                            }
                            
                            if not any(m['src'] == new_message['src'] and m['msg_id'] == new_message['msg_id'] for m in messages):
                                messages.append(new_message)
                                print(f"[NEW MESSAGE] {new_message['name']}: {new_message['message'][:50]}...")
                                
                                if len(messages) > 200:
                                    messages.pop(0)
                        
                        except json.JSONDecodeError:
                            print(f"[WARNING] Invalid JSON from serial: {line}")
            
            except Exception as e:
                print(f"[ERROR] Serial read error: {e}")

# ---------- API ROUTES ----------
@app.route("/api/messages", methods=["GET"])
def get_messages():
    """Get all messages"""
    return jsonify(messages)

@app.route("/api/health", methods=["GET"])
def health():
    """Health check endpoint"""
    serial_status = "connected" if ser and ser.is_open else "disconnected"
    return jsonify({
        "status": "healthy",
        "total_messages": len(messages),
        "serial_port": "COM3",
        "serial_status": serial_status
    })

@app.route("/")
def index():
    return jsonify({
        "service": "skAiNet Node Data Monitor",
        "status": "running",
        "serial_port": "COM3",
        "endpoints": {
            "/api/messages": "GET - Fetch all messages",
            "/api/health": "GET - Health check"
        }
    })

# ---------- STARTUP ----------
if __name__ == "__main__":
    print("=" * 60)
    print("skAiNet Node Data Monitor Server")
    print("=" * 60)
    
    if init_serial():
        serial_thread = threading.Thread(target=read_serial_loop, daemon=True)
        serial_thread.start()
        print(f"[INFO] Started serial data reading from COM3")
    else:
        print("[ERROR] Failed to initialize serial connection")
    
    print(f"[INFO] Server starting on http://0.0.0.0:5000")
    print("=" * 60)
    
    app.run(host="0.0.0.0", port=5000, debug=False)