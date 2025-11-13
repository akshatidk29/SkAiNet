from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os
import time
import threading

app = Flask(__name__)
CORS(app)

# Global variables
messages = []
disaster_logs = []
current_log_index = 0
is_running = True

# ---------- LOAD DISASTER LOGS ----------
def load_disaster_logs():
    """Load all disaster log files"""
    global disaster_logs
    log_files = [
        '../Data/disaster_logs_high_urgency.json',
        '../Data/disaster_logs_medium_urgency.json',
        '../Data/disaster_logs_low_urgency.json'
    ]
    
    for log_file in log_files:
        if os.path.exists(log_file):
            try:
                with open(log_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    logs = data.get('logs', [])
                    disaster_logs.extend(logs)
                print(f"[INFO] Loaded {len(logs)} messages from {log_file}")
            except Exception as e:
                print(f"[ERROR] Could not load {log_file}: {e}")
    
    print(f"[INFO] Total disaster logs loaded: {len(disaster_logs)}")
    return len(disaster_logs)

def send_messages_loop():
    """Background thread to send messages automatically"""
    global current_log_index, is_running
    
    while is_running:
        if disaster_logs and len(disaster_logs) > 0:
            # Get next log entry
            log_entry = disaster_logs[current_log_index]
            
            # Create message in the format expected by frontend
            new_message = {
                "src": str(log_entry.get('source_node', '1')),
                "cur": str(log_entry.get('current_node', '1')),
                "msg_id": str(log_entry.get('message_id', '0000')),
                "name": log_entry.get('sender_name', ''),
                "message": log_entry.get('message', ''),
                "gps": log_entry.get('gps'),
                "urgency": log_entry.get('urgency')
            }
            
            # Check for duplicates
            if not any(m['src'] == new_message['src'] and m['msg_id'] == new_message['msg_id'] for m in messages):
                messages.append(new_message)
                print(f"[NEW MESSAGE] {new_message['name']}: {new_message['message'][:50]}...")
                
                # Keep only last 200 messages
                if len(messages) > 200:
                    messages.pop(0)
            
            # Move to next log entry
            current_log_index = (current_log_index + 1) % len(disaster_logs)
            
            # Wait 2-4 seconds before next message
            time.sleep(2.5)
        else:
            time.sleep(5)

# ---------- API ROUTES ----------
@app.route("/api/messages", methods=["GET"])
def get_messages():
    """Get all messages"""
    return jsonify(messages)

@app.route("/api/health", methods=["GET"])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "total_messages": len(messages),
        "disaster_logs_loaded": len(disaster_logs),
        "current_index": current_log_index
    })

@app.route("/api/test/clear", methods=["POST"])
def clear_messages():
    """Clear all messages"""
    global messages
    messages = []
    return jsonify({
        "status": "success",
        "message": "All messages cleared",
        "total_messages": 0
    })

@app.route("/api/test/add-custom", methods=["POST"])
def add_custom_message():
    """Add a custom message"""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    new_message = {
        "src": str(data.get('source_node', data.get('src', '1'))),
        "cur": str(data.get('current_node', data.get('cur', '1'))),
        "msg_id": str(data.get('message_id', data.get('msg_id', '0000'))),
        "name": data.get('sender_name', data.get('name', 'Test User')),
        "message": data.get('message', 'Test message'),
        "gps": data.get('gps'),
        "urgency": data.get('urgency')
    }
    
    messages.append(new_message)
    
    if len(messages) > 200:
        messages.pop(0)
    
    return jsonify({
        "status": "success",
        "message": "Custom message added",
        "total_messages": len(messages)
    })

@app.route("/")
def index():
    return jsonify({
        "service": "skAiNet Disaster Response Monitor",
        "status": "running",
        "endpoints": {
            "/api/messages": "GET - Fetch all messages",
            "/api/health": "GET - Health check",
            "/api/test/clear": "POST - Clear all messages",
            "/api/test/add-custom": "POST - Add custom message"
        }
    })

# ---------- STARTUP ----------
if __name__ == "__main__":
    print("=" * 60)
    print("skAiNet Disaster Response Monitor Server")
    print("=" * 60)
    
    # Load disaster logs
    total_logs = load_disaster_logs()
    
    if total_logs > 0:
        # Start background thread
        message_thread = threading.Thread(target=send_messages_loop, daemon=True)
        message_thread.start()
        print(f"[INFO] Started automatic message sending")
    else:
        print("[WARNING] No disaster logs loaded. Server running in passive mode.")
    
    print(f"[INFO] Server starting on http://0.0.0.0:5000")
    print("=" * 60)
    
    # Run Flask app
    app.run(host="0.0.0.0", port=5000, debug=False)
from flask import Flask, render_template_string
import serial
import threading

app = Flask(__name__)

SERIAL_PORT = 'COM3'
BAUDRATE = 115200

try:
    ser = serial.Serial(SERIAL_PORT, BAUDRATE, timeout=1)
    print(f"[INFO] Serial port {SERIAL_PORT} opened successfully")
except Exception as e:
    print(f"[ERROR] Could not open serial port: {e}")
    ser = None

# ---------- GLOBALS ----------
messages = []  


def read_serial():
    while True:
        if ser and ser.in_waiting:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            if line.startswith("SRC="):
                try:
                    header, content = line.split(":")
                    src_part,cur_part, msg_part = header.split(",")
                    src = src_part.split("=")[1]
                    cur = cur_part.split("=")[1]
                    msg_id = msg_part.split("=")[1]

                    # Parse content: "Name-Message"
                    if "-" in content:
                        name, msg_text = content.split("-", 1)
                    else:
                        name = ""
                        msg_text = content

                    # Avoid duplicates
                    if not any(m['src'] == src and m['msg_id'] == msg_id for m in messages):
                        messages.append({
                            "src": src,
                            "cur" : cur,
                            "msg_id": msg_id,
                            "name": name,
                            "message": msg_text
                        })

                        # Limit to last 50 messages
                        if len(messages) > 50:
                            messages.pop(0)
                except:
                    continue


# Start the serial thread
if ser:
    threading.Thread(target=read_serial, daemon=True).start()


# ---------- WEBPAGE ----------
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>SkyNet Messages Dashboard</title>
<style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f0f3f7; margin: 0; padding: 0; }
    .container { max-width: 900px; margin: 30px auto; padding: 20px; background: #fff; border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.1);}
    h1 { text-align: center; color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #007bff; color: white; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    tr:hover { background-color: #e1f0ff; }
    .src { font-weight: bold; color: #007bff; }
    .name { color: #333; font-weight: 500; }
    .message { color: #555; }
</style>
<meta http-equiv="refresh" content="2">
</head>
<body>
<div class="container">
<h1>SkyNet LoRa Messages</h1>
<table>
<thead>
<tr>
<th>SRC</th>
<th>Name</th>
<th>Message</th>
</tr>
</thead>
<tbody>
{% for msg in messages %}
<tr>
<td class="src">{{ msg.src }}</td>
<td class="cur">{{ msg.cur }}</td>
<td class="name">{{ msg.name }}</td>
<td class="message">{{ msg.message }}</td>
</tr>
{% endfor %}
</tbody>
</table>
</div>
</body>
</html>
"""

@app.route("/")
def index():
    return render_template_string(HTML_TEMPLATE, messages=messages)


# ---------- RUN SERVER ----------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
