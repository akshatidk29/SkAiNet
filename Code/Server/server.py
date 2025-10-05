from flask import Flask, render_template_string
import serial
import threading

app = Flask(__name__)

# ---------- SERIAL SETUP ----------
SERIAL_PORT = 'COM3'
BAUDRATE = 115200

try:
    ser = serial.Serial(SERIAL_PORT, BAUDRATE, timeout=1)
    print(f"[INFO] Serial port {SERIAL_PORT} opened successfully")
except Exception as e:
    print(f"[ERROR] Could not open serial port: {e}")
    ser = None

# ---------- GLOBALS ----------
messages = []  # Store received messages


# ---------- SERIAL READING THREAD ----------
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
