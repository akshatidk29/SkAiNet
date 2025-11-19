#include "LoRaWan_APP.h"
#include "Arduino.h"
#include <WiFi.h>
#include <DNSServer.h>
#include <ESPAsyncWebServer.h>
#include <Wire.h>
#include "HT_SSD1306Wire.h"

#include <AESLib.h>
#include <Base64.h>

// --- LoRa Config ---
#define RF_FREQUENCY 866000000  // Hz
#define TX_OUTPUT_POWER 14
#define LORA_BANDWIDTH 0
#define LORA_SPREADING_FACTOR 7
#define LORA_CODINGRATE 1
#define LORA_PREAMBLE_LENGTH 8
#define LORA_SYMBOL_TIMEOUT 0
#define LORA_FIX_LENGTH_PAYLOAD_ON false
#define LORA_IQ_INVERSION_ON false
#define RX_TIMEOUT_VALUE 1000
#define BUFFER_SIZE 256

#define NODE_ID 1

// --- STATIC GPS LOCATION (FALLBACK) ---
float STATIC_LAT = 31.781219;  // Fallback: IIT Mandi latitude
float STATIC_LON = 76.999085;  // Fallback: IIT Mandi longitude

// --- PREDEFINED LOCATIONS ---
struct Location {
  String name;
  float lat;
  float lon;
};

Location locations[] = {
  { "Academic Block-IIT Mandi", 31.780566, 76.997168 },
  { "VillageSquare-IIT Mandi", 31.781070, 76.994567 },
  { "Hockey Ground-IIT Mandi", 31.782918, 77.003476 }
};

const int NUM_LOCATIONS = 3;

AESLib aesLib;

// --- AES key ---
byte aes_key[16] = { 'm', 'y', 's', 'e', 'c', 'r', 'e', 't', 'k', 'e', 'y', '1', '2', '3', '4' };
byte aes_iv[16] = { 'i', 'n', 'i', 't', 'v', 'e', 'c', '1', '2', '3', '4', '5', '6', '7' };

// --- ENCRYPTION-DECRYPTION ---
String encryptString(String msg) {
  int msgLen = msg.length() + 1;
  int paddedLen = msgLen + (16 - (msgLen % 16)) % 16;

  byte input[paddedLen];
  memset(input, 0, paddedLen);
  memcpy(input, msg.c_str(), msgLen);

  byte encrypted[paddedLen];
  memset(encrypted, 0, paddedLen);

  byte iv_copy[16];
  memcpy(iv_copy, aes_iv, 16);

  aesLib.encrypt(input, paddedLen, encrypted, aes_key, 128, iv_copy);

  int encodedLen = base64_enc_len(paddedLen);
  char encoded[encodedLen + 1];
  base64_encode(encoded, (char *)encrypted, paddedLen);
  encoded[encodedLen] = '\0';

  return String(encoded);
}

String decryptString(String base64msg) {
  int decodedLen = base64_dec_len(base64msg.c_str(), base64msg.length());
  byte decoded[decodedLen];
  memset(decoded, 0, decodedLen);

  base64_decode((char *)decoded, base64msg.c_str(), base64msg.length());

  byte decrypted[decodedLen + 1];
  memset(decrypted, 0, sizeof(decrypted));

  byte iv_copy[16];
  memcpy(iv_copy, aes_iv, 16);

  aesLib.decrypt(decoded, decodedLen, decrypted, aes_key, 128, iv_copy);
  decrypted[decodedLen] = '\0';

  return String((char *)decrypted);
}

// --- GLOBAL ---
char txpacket[BUFFER_SIZE];
char rxpacket[BUFFER_SIZE];
bool lora_idle = true;
static RadioEvents_t RadioEvents;

String pendingMsg = "";

const int REBROADCASTS = 5;
const int REBROADCAST_DELAY = 1000;
int rebroadcastsLeft = 0;
unsigned long lastTxTime = 0;

// Message cache
struct MessageCacheEntry {
  int src;
  int msgId;
};

#define CACHE_SIZE 30
MessageCacheEntry cache[CACHE_SIZE];
int cacheIndex = 0;

bool seenMessage(int src, int msgId) {
  for (int i = 0; i < CACHE_SIZE; i++) {
    if (cache[i].src == src && cache[i].msgId == msgId) return true;
  }
  return false;
}

void addToCache(int src, int msgId) {
  cache[cacheIndex] = { src, msgId };
  cacheIndex = (cacheIndex + 1) % CACHE_SIZE;
}

// Inbox
struct Msg {
  String from;
  String content;
  bool unread;
};
std::vector<Msg> inbox;

// --- OLED ---
static SSD1306Wire display(0x3c, 500000, SDA_OLED, SCL_OLED, GEOMETRY_128_64, RST_OLED);
unsigned long lastMessageDisplayTime = 0;
const unsigned long MESSAGE_DISPLAY_DURATION = 5000;  // 5 seconds
bool showingMessage = false;

void VextON(void) {
  pinMode(Vext, OUTPUT);
  digitalWrite(Vext, LOW);
}

void showOLED(String l1, String l2 = "", String l3 = "", String l4 = "") {
  display.clear();
  display.setFont(ArialMT_Plain_10);
  display.setTextAlignment(TEXT_ALIGN_LEFT);
  if (l1 != "") display.drawString(0, 0, l1);
  if (l2 != "") display.drawString(0, 16, l2);
  if (l3 != "") display.drawString(0, 32, l3);
  if (l4 != "") display.drawString(0, 48, l4);
  display.display();
}

void displayMainScreen() {
  display.clear();
  display.setFont(ArialMT_Plain_16);
  display.setTextAlignment(TEXT_ALIGN_CENTER);
  display.drawString(64, 0, "SkAiNet Node");

  display.setFont(ArialMT_Plain_24);
  display.drawString(64, 20, String(NODE_ID));

  display.setFont(ArialMT_Plain_10);
  display.drawString(64, 50, "Messages: " + String(inbox.size()));

  display.display();
  showingMessage = false;
}

void displayReceivedMessage(String from, String content, int rssi) {
  display.clear();
  display.setFont(ArialMT_Plain_10);
  display.setTextAlignment(TEXT_ALIGN_LEFT);

  display.drawString(0, 0, "NEW MESSAGE");
  display.drawLine(0, 12, 128, 12);

  display.drawString(0, 16, "From: " + from);

  // Wrap content text if too long
  if (content.length() > 21) {
    display.drawString(0, 28, content.substring(0, 21));
    display.drawString(0, 40, content.substring(21));
  } else {
    display.drawString(0, 28, content);
  }

  display.drawString(0, 52, "RSSI: " + String(rssi) + " dBm");

  display.display();
  showingMessage = true;
  lastMessageDisplayTime = millis();
}

void displaySentMessage(String name, String info) {
  display.clear();
  display.setFont(ArialMT_Plain_10);
  display.setTextAlignment(TEXT_ALIGN_LEFT);

  display.drawString(0, 0, "SENDING MESSAGE");
  display.drawLine(0, 12, 128, 12);

  display.drawString(0, 20, "Name: " + name);

  // Wrap info text if too long
  if (info.length() > 21) {
    display.drawString(0, 32, info.substring(0, 21));
    display.drawString(0, 44, info.substring(21));
  } else {
    display.drawString(0, 32, "Info: " + info);
  }

  display.display();
  showingMessage = true;
  lastMessageDisplayTime = millis();
}

// --- WiFi & Captive Portal ---
const byte DNS_PORT = 53;
IPAddress apIP(192, 168, 4, 1);
IPAddress netMsk(255, 255, 255, 0);

DNSServer dnsServer;
AsyncWebServer server(80);


// LoRa Functions
void startSendLoRaMessage(String payload) {
  payload = encryptString(payload);
  snprintf(txpacket, BUFFER_SIZE, "%s", payload.c_str());
  pendingMsg = payload;
  rebroadcastsLeft = REBROADCASTS;
  lastTxTime = 0;
}

// Retransmission
void handleLoRaTx() {
  if (rebroadcastsLeft > 0 && lora_idle && millis() - lastTxTime >= REBROADCAST_DELAY) {
    Radio.Send((uint8_t *)txpacket, strlen(txpacket));
    lora_idle = false;
    lastTxTime = millis();
    rebroadcastsLeft--;
  }
}

// Callbacks
void OnTxDone(void) {
  lora_idle = true;
  Radio.Rx(0);
}

void OnTxTimeout(void) {
  lora_idle = true;
  Radio.Rx(0);
}

void OnRxDone(uint8_t *payload, uint16_t size, int16_t rssi, int8_t snr) {
  memcpy(rxpacket, payload, size);
  rxpacket[size] = '\0';
  Radio.Sleep();

  String msg = String(rxpacket);
  msg = decryptString(msg);
  int sep = msg.indexOf(':');
  if (sep == -1) {
    Radio.Rx(0);
    return;
  }

  String header = msg.substring(0, sep);
  String content = msg.substring(sep + 1);

  int src = -1, cur = -1, msgId = -1;
  sscanf(header.c_str(), "SRC=%d,CUR=%d,MSG=%d", &src, &cur, &msgId);

  // Extract LAT and LON directly (always present)
  int latIndex = header.indexOf("LAT=");
  int lonIndex = header.indexOf("LON=");
  float lat = header.substring(latIndex + 4, header.indexOf(',', latIndex)).toFloat();
  float lon = header.substring(lonIndex + 4, header.indexOf(':', lonIndex)).toFloat();

  // Ignore own messages
  if (src != NODE_ID) {
    if (!seenMessage(src, msgId)) {
      String jsonOutput = "{";
      jsonOutput += "\"source_node\":" + String(src) + ",";
      jsonOutput += "\"current_node\":" + String(cur) + ",";
      jsonOutput += "\"message_id\":\"" + String(msgId) + "\",";
      jsonOutput += "\"gps\":{\"latitude\":" + String(lat, 6) + ",\"longitude\":" + String(lon, 6) + "},";
      jsonOutput += "\"sender_name\":\"Node " + String(src) + "\",";
      jsonOutput += "\"message\":\"" + content + "\",";
      jsonOutput += "\"rssi\":" + String(rssi);
      jsonOutput += "}";
      Serial.println(jsonOutput);

      addToCache(src, msgId);
      inbox.push_back({ "Node " + String(src), content, true });
      displayReceivedMessage("Node " + String(src), content, rssi);

      // Rebroadcast
      int curIndex = msg.indexOf("CUR=");
      if (curIndex != -1) {
        int commaAfterCur = msg.indexOf(',', curIndex + 4);
        if (commaAfterCur == -1) commaAfterCur = msg.indexOf(':', curIndex + 4);
        if (commaAfterCur != -1) {
          msg = msg.substring(0, curIndex) + "CUR=" + String(NODE_ID) + msg.substring(commaAfterCur);
        }
      }

      startSendLoRaMessage(msg);
    }
  }

  Radio.Rx(0);
}

// Web Server
String htmlPage() {
  String html = "<!DOCTYPE html><html><head><meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0'>";
  html += "<title>SkAiNet Node " + String(NODE_ID) + "</title>";

  // Professional, mobile-optimized CSS
  html += "<style>"
          "* { margin: 0; padding: 0; box-sizing: border-box; }"
          "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;"
          "background: linear-gradient(135deg, #f0f2f5 0%, #d9dde3 100%); color: #1f2937; min-height: 100vh; padding: 20px; }"

          ".container { max-width: 650px; margin: 0 auto; background-color: #ffffff; border-radius: 18px;"
          "box-shadow: 0 4px 30px rgba(0,0,0,0.08); overflow: hidden; }"

          ".header { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; padding: 28px; text-align: center; }"
          ".header h1 { font-size: 26px; font-weight: 700; margin-bottom: 6px; letter-spacing: -0.3px; }"
          ".header p { font-size: 15px; opacity: 0.95; }"

          ".content { padding: 28px; }"

          ".section { margin-bottom: 34px; }"
          ".section-title { font-size: 18px; font-weight: 600; color: #1e293b; margin-bottom: 16px;"
          "padding-bottom: 10px; border-bottom: 2px solid #e5e7eb; }"

          ".form-group { margin-bottom: 18px; }"
          ".form-group label { display: block; font-size: 14px; font-weight: 500; color: #475569; margin-bottom: 6px; }"

          ".form-group input, .form-group select { width: 100%; padding: 12px 16px; font-size: 15px;"
          "border: 1.8px solid #cbd5e1; border-radius: 10px; background-color: #f8fafc;"
          "transition: all 0.2s ease; }"

          ".form-group input:focus, .form-group select:focus { outline: none; border-color: #3b82f6; background-color: #fff;"
          "box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25); }"

          ".btn { width: 100%; padding: 14px; font-size: 16px; font-weight: 600; color: white;"
          "background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); border: none; border-radius: 10px;"
          "cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease; }"

          ".btn:hover { box-shadow: 0 8px 25px rgba(59, 130, 246, 0.35); }"
          ".btn:active { transform: scale(0.98); }"

          ".message-list { list-style: none; }"

          ".message-item { background-color: #f8fafc; padding: 18px; margin-bottom: 14px;"
          "border-radius: 12px; border-left: 5px solid #1e3a8a; }"

          ".message-from { font-weight: 600; color: #1e3a8a; font-size: 14px; margin-bottom: 4px; }"
          ".message-content { color: #475569; font-size: 15px; line-height: 1.55; }"

          ".no-messages { text-align: center; padding: 34px; color: #94a3b8; font-size: 15px; }"

          ".divider { height: 1px; background: linear-gradient(to right, transparent, #d1d5db, transparent); margin: 30px 0; }"

          "@media (max-width: 480px) { body { padding: 10px; } .content { padding: 20px; }"
          ".header { padding: 22px; } .header h1 { font-size: 22px; } }"
          "</style>";


  html += "</head><body>";
  html += "<div class='container'>";

  // Header
  html += "<div class='header'>";
  html += "<h1>SkAiNet Node " + String(NODE_ID) + "</h1>";
  html += "<p>LoRa Mesh Network Interface</p>";
  html += "</div>";

  html += "<div class='content'>";

  // Send Message Section
  html += "<div class='section'>";
  html += "<div class='section-title'>Send Message</div>";
  html += "<form action='/submit' method='GET'>";

  html += "<div class='form-group'>";
  html += "<label for='name'>Your Name</label>";
  html += "<input type='text' id='name' name='name' placeholder='Enter your name' required>";
  html += "</div>";

  html += "<div class='form-group'>";
  html += "<label for='info'>Message</label>";
  html += "<input type='text' id='info' name='info' placeholder='Enter your message' required>";
  html += "</div>";

  html += "<div class='form-group'>";
  html += "<label for='location'>Location</label>";
  html += "<select id='location' name='location'>";
  html += "<option value=''>Use Node Default Location</option>";
  for (int i = 0; i < NUM_LOCATIONS; i++) {
    html += "<option value='" + String(i) + "'>" + locations[i].name + "</option>";
  }
  html += "</select>";
  html += "</div>";

  html += "<button type='submit' class='btn'>Send Message</button>";
  html += "</form>";
  html += "</div>";

  html += "<div class='divider'></div>";

  // Inbox Section
  html += "<div class='section'>";
  html += "<div class='section-title'>Received Messages (" + String(inbox.size()) + ")</div>";

  if (inbox.empty()) {
    html += "<div class='no-messages'>No messages received yet</div>";
  } else {
    html += "<ul class='message-list'>";
    for (int i = inbox.size() - 1; i >= 0 && i >= (int)inbox.size() - 10; i--) {
      html += "<li class='message-item'>";
      html += "<div class='message-from'>" + inbox[i].from + "</div>";
      html += "<div class='message-content'>" + inbox[i].content + "</div>";
      html += "</li>";
    }
    html += "</ul>";
  }

  html += "</div>";
  html += "</div></div></body></html>";
  return html;
}

void setupWeb() {
  dnsServer.start(DNS_PORT, "*", apIP);

  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/html", htmlPage());
  });

  server.on("/submit", HTTP_GET, [](AsyncWebServerRequest *request) {
    String name, info;
    float lat = STATIC_LAT;
    float lon = STATIC_LON;

    if (request->hasParam("name")) name = request->getParam("name")->value();
    if (request->hasParam("info")) info = request->getParam("info")->value();

    // Check if location was selected
    if (request->hasParam("location") && request->getParam("location")->value() != "") {
      int locIndex = request->getParam("location")->value().toInt();
      if (locIndex >= 0 && locIndex < NUM_LOCATIONS) {
        lat = locations[locIndex].lat;
        lon = locations[locIndex].lon;
      }
    }

    int id = random(1000, 9999);
    String payload = "SRC=" + String(NODE_ID) + ",CUR=" + String(NODE_ID) + ",MSG=" + String(id) + ",LAT=" + String(lat, 6) + ",LON=" + String(lon, 6) + ":" + name + "-" + info;
    pendingMsg = payload;
    startSendLoRaMessage(payload);
    displaySentMessage(name, info);

    String redirect = "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
                      "<meta name='viewport' content='width=device-width, initial-scale=1.0'>"
                      "<style>body{font-family:Arial,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);"
                      "display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}"
                      ".box{background:#fff;padding:40px;border-radius:16px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.2);}"
                      "h2{color:#667eea;margin-bottom:16px;}p{color:#4a5568;}</style>"
                      "<meta http-equiv='refresh' content='2; url=/' /></head><body>"
                      "<div class='box'><h2>Message Sent Successfully</h2><p>Redirecting...</p></div></body></html>";

    request->send(200, "text/html", redirect);
  });

  // Captive portal triggers
  server.on("/generate_204", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->redirect("/");
  });
  server.on("/fwlink", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->redirect("/");
  });
  server.on("/hotspot-detect.html", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->redirect("/");
  });

  server.onNotFound([](AsyncWebServerRequest *request) {
    request->redirect("/");
  });
  server.begin();
}

// --- SETUP ---
void setup() {
  Serial.begin(115200);
  Mcu.begin(HELTEC_BOARD, SLOW_CLK_TPYE);
  randomSeed(micros());

  // OLED
  VextON();
  delay(100);
  display.init();
  display.clear();
  display.setFont(ArialMT_Plain_16);
  display.setTextAlignment(TEXT_ALIGN_CENTER);
  display.drawString(64, 10, "Initializing");
  display.setFont(ArialMT_Plain_10);
  display.drawString(64, 35, "SkAiNet Node " + String(NODE_ID));
  display.display();
  delay(2000);

  // WiFi AP
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(apIP, apIP, netMsk);
  WiFi.softAP("SkAiNet" + String(NODE_ID));
  setupWeb();

  display.clear();
  display.setFont(ArialMT_Plain_10);
  display.setTextAlignment(TEXT_ALIGN_LEFT);
  display.drawString(0, 0, "WiFi AP Active");
  display.drawString(0, 16, "SkAiNet" + String(NODE_ID));
  display.drawString(0, 32, "IP: " + WiFi.softAPIP().toString());
  display.drawString(0, 48, "Starting LoRa...");
  display.display();
  delay(2000);

  // LoRa init
  RadioEvents.TxDone = OnTxDone;
  RadioEvents.TxTimeout = OnTxTimeout;
  RadioEvents.RxDone = OnRxDone;

  Radio.Init(&RadioEvents);
  Radio.SetChannel(RF_FREQUENCY);
  Radio.SetTxConfig(MODEM_LORA, TX_OUTPUT_POWER, 0, LORA_BANDWIDTH,
                    LORA_SPREADING_FACTOR, LORA_CODINGRATE,
                    LORA_PREAMBLE_LENGTH, LORA_FIX_LENGTH_PAYLOAD_ON,
                    true, 0, 0, LORA_IQ_INVERSION_ON, 3000);

  Radio.SetRxConfig(MODEM_LORA, LORA_BANDWIDTH, LORA_SPREADING_FACTOR,
                    LORA_CODINGRATE, 0, LORA_PREAMBLE_LENGTH,
                    LORA_SYMBOL_TIMEOUT, LORA_FIX_LENGTH_PAYLOAD_ON,
                    0, true, 0, 0, LORA_IQ_INVERSION_ON, true);

  Radio.Rx(0);

  // Show main screen
  displayMainScreen();
}

// --- LOOP ---
void loop() {
  dnsServer.processNextRequest();
  Radio.IrqProcess();
  handleLoRaTx();

  // Return to main screen after displaying message
  if (showingMessage && (millis() - lastMessageDisplayTime >= MESSAGE_DISPLAY_DURATION)) {
    displayMainScreen();
  }

  if (inbox.size() > 50) inbox.erase(inbox.begin(), inbox.begin() + (inbox.size() - 50));
}