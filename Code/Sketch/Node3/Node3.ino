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

#define NODE_ID 3


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

// --- OLED ---
static SSD1306Wire display(0x3c, 500000, SDA_OLED, SCL_OLED, GEOMETRY_128_64, RST_OLED);
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

// --- WiFi & Captive Portal ---
const byte DNS_PORT = 53;
IPAddress apIP(192, 168, 4, 1);
IPAddress netMsk(255, 255, 255, 0);

DNSServer dnsServer;
AsyncWebServer server(80);

// Inbox
struct Msg {
  String from;
  String content;
  bool unread;
};
std::vector<Msg> inbox;


// LoRa Functions
void startSendLoRaMessage(String payload) {
  payload = encryptString(payload);
  snprintf(txpacket, BUFFER_SIZE, "%s", payload.c_str());
  pendingMsg = payload;
  rebroadcastsLeft = REBROADCASTS;
  lastTxTime = 0;
  Serial.println("[DEBUG] startSendLoRaMessage called:");
  Serial.println("        Payload: " + payload);
  Serial.println("        Rebroadcasts left: " + String(rebroadcastsLeft));
}

// Retransmission
void handleLoRaTx() {
  if (rebroadcastsLeft > 0 && lora_idle && millis() - lastTxTime >= REBROADCAST_DELAY) {
    Radio.Send((uint8_t *)txpacket, strlen(txpacket));
    lora_idle = false;
    lastTxTime = millis();
    Serial.println("[DEBUG] Sending message: " + String(txpacket));
    Serial.println("        Rebroadcasts left before send: " + String(rebroadcastsLeft));
    rebroadcastsLeft--;
  }
}

// Callbacks
void OnTxDone(void) {
  lora_idle = true;
  Serial.println("[DEBUG] Transmission done.");
  Radio.Rx(0);
}

void OnTxTimeout(void) {
  lora_idle = true;
  Serial.println("[DEBUG] Transmission timeout.");
  Radio.Rx(0);
}

void OnRxDone(uint8_t *payload, uint16_t size, int16_t rssi, int8_t snr) {
  memcpy(rxpacket, payload, size);
  rxpacket[size] = '\0';
  Radio.Sleep();

  String msg = String(rxpacket);
  Serial.println("Recieved Something " + msg);
  msg = decryptString(msg);
  Serial.println("Decrypted " + msg);
  int sep = msg.indexOf(':');
  if (sep == -1) {
    Radio.Rx(0);
    return;
  }

  String header = msg.substring(0, sep);
  String content = msg.substring(sep + 1);

  int src = -1, cur = -1, msgId = -1;
  sscanf(header.c_str(), "SRC=%d,CUR=%d,MSG=%d", &src, &cur, &msgId);

  Serial.println("[DEBUG] Received message:");
  Serial.println("        Source: Node " + String(src));
  Serial.println("        Current: Node " + String(cur));
  Serial.println("        MsgID: " + String(msgId));
  Serial.println("        Content: " + content);
  Serial.println("        RSSI: " + String(rssi));

  // Ignore own messages
  if (src != NODE_ID) {
    if (!seenMessage(src, msgId)) {
      addToCache(src, msgId);

      inbox.push_back({ "Node " + String(src), content, true });
      showOLED("LoRa RX", "From " + String(src), content, "RSSI " + String(rssi));
      Serial.println("[DEBUG] Added message to inbox and cache.");

      // Rebroadcast
      int curIndex = msg.indexOf("CUR=");
      if (curIndex != -1) {
        int commaAfterCur = msg.indexOf(',', curIndex + 4);
        if (commaAfterCur == -1) commaAfterCur = msg.indexOf(':', curIndex + 4);
        if (commaAfterCur != -1) {
          // Replace the old CUR field
          msg = msg.substring(0, curIndex) + "CUR=" + String(NODE_ID) + msg.substring(commaAfterCur);
        }
      }

      startSendLoRaMessage(msg);
      Serial.println("[DEBUG] Rebroadcasting message.");
    } else {
      Serial.println("[DEBUG] Duplicate message ignored.");
    }
  } else {
    Serial.println("[DEBUG] Ignored own message.");
  }

  Radio.Rx(0);
}


// Web Server
String htmlPage() {
  String html = "<!DOCTYPE html><html><head><meta charset='UTF-8'>";
  html += "<title>SkyNet Node " + String(NODE_ID) + "</title>";

  // Minimal clean CSS
  html += "<style>"
          "body { font-family: Arial, sans-serif; background-color: #f4f4f4; color: #333; margin: 0; padding: 0; }"
          ".container { max-width: 800px; margin: 20px auto; padding: 20px; background-color: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }"
          "h2, h3 { color: #222; }"
          "form input[type=text] { width: 100%; padding: 8px; margin: 4px 0 10px 0; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }"
          "form input[type=submit] { padding: 10px 20px; border: none; border-radius: 4px; background-color: #007bff; color: #fff; cursor: pointer; }"
          "form input[type=submit]:hover { background-color: #0056b3; }"
          "ul { padding-left: 20px; }"
          "li { margin-bottom: 6px; }"
          "</style>";

  html += "</head><body>";
  html += "<div class='container'>";
  html += "<h2>LoRa Node " + String(NODE_ID) + "</h2>";

  // Send form
  html += "<h3>Send a Message</h3>";
  html += "<form action='/submit'>"
          "<label>Name:</label><br>"
          "<input type='text' name='name' required><br>"
          "<label>Info:</label><br>"
          "<input type='text' name='info' required><br>"
          "<input type='submit' value='Send'>"
          "</form><hr>";

  // Inbox
  html += "<h3>Received Messages</h3>";
  if (inbox.empty()) {
    html += "<p>No messages received yet.</p>";
  } else {
    html += "<ul>";
    for (auto &m : inbox) {
      html += "<li><b>" + m.from + ":</b> " + m.content + "</li>";
    }
    html += "</ul>";
  }

  html += "</div></body></html>";
  return html;
}


void setupWeb() {
  dnsServer.start(DNS_PORT, "*", apIP);

  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/html", htmlPage());
  });

  server.on("/submit", HTTP_GET, [](AsyncWebServerRequest *request) {
    String name, info;
    if (request->hasParam("name")) name = request->getParam("name")->value();
    if (request->hasParam("info")) info = request->getParam("info")->value();

    int id = random(1000, 9999);
    String payload = "SRC=" + String(NODE_ID) + ",CUR=" + String(NODE_ID) + ",MSG=" + String(id) + ":" + name + "-" + info;
    pendingMsg = payload;
    startSendLoRaMessage(payload);
    showOLED("LoRa TX", name, info);

    Serial.println("[DEBUG] Web submit:");
    Serial.println("        MsgID: " + String(id));
    Serial.println("        Name: " + name);
    Serial.println("        Info: " + info);
    Serial.println("        Payload queued for sending.");

    request->send(200, "text/html", "<h3>Message sent! Redirecting...</h3><meta http-equiv='refresh' content='1; url=/' />");
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

// --- SetUP
void setup() {
  Serial.begin(115200);
  Mcu.begin(HELTEC_BOARD, SLOW_CLK_TPYE);
  randomSeed(micros());
  // OLED
  VextON();
  delay(100);
  display.init();
  showOLED("Starting Node...", "ID: " + String(NODE_ID));
  delay(1000);

  // WiFi AP
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(apIP, apIP, netMsk);
  WiFi.softAP("SkyNet_" + String(NODE_ID));
  setupWeb();
  showOLED("AP Started", "SkyNet_" + String(NODE_ID), "IP: " + WiFi.softAPIP().toString());

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
}

// --- Loop ---
void loop() {
  dnsServer.processNextRequest();
  Radio.IrqProcess();
  handleLoRaTx();

  if (inbox.size() > 50) inbox.erase(inbox.begin(), inbox.begin() + (inbox.size() - 50));
}
