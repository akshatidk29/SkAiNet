import json
import random

# --- Step 1: Load JSON data ---
with open("C:/Users/Vansh/Desktop/SkAiNet/Code/Server/frontend/public/Data/disaster_logs_high_urgency.json", "r") as f:
    data = json.load(f)

# --- Step 2: Deduplicate logs by message_id ---
unique_logs = []
seen_ids = set()

for log in data["logs"]:
    if log["message_id"] not in seen_ids:
        seen_ids.add(log["message_id"])
        unique_logs.append(log)
    if len(unique_logs) == 100:
        break

# --- Step 4: Slightly shift coordinates if duplicates exist ---
coord_counts = {}
for log in unique_logs:
    coord = (log["gps"]["latitude"], log["gps"]["longitude"])
    coord_counts[coord] = coord_counts.get(coord, 0) + 1

coord_offsets = {coord: 0 for coord in coord_counts}

for log in unique_logs:
    coord = (log["gps"]["latitude"], log["gps"]["longitude"])
    count = coord_counts[coord]

    if count > 1:
        # Apply a tiny random jitter (within ±0.00001 degrees)
        jitter_lat = random.uniform(-0.0001, 0.0001)
        jitter_lon = random.uniform(-0.0001, 0.0001)
        log["gps"]["latitude"] += jitter_lat
        log["gps"]["longitude"] += jitter_lon

# --- Step 5: Save output ---
data["logs"] = unique_logs

with open("disaster_logs_high_urgency.json", "w") as f:
    json.dump(data, f, indent=2)

print("✅ Done! Coordinates slightly shifted and saved as output_shifted.json")
