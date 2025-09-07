#include "LoRaWan_APP.h"
#include "Arduino.h"
#include <WiFi.h>
#include <DNSServer.h>
#include <ESPAsyncWebServer.h>
#include <Wire.h>
#include "HT_SSD1306Wire.h"


// ---- LoRa Config ----
#define RF_FREQUENCY        915000000 // Hz
#define TX_OUTPUT_POWER     14        // dBm
#define LORA_BANDWIDTH      0
#define LORA_SPREADING_FACTOR 7
#define LORA_CODINGRATE     1
#define LORA_PREAMBLE_LENGTH 8
#define LORA_SYMBOL_TIMEOUT 0
#define LORA_FIX_LENGTH_PAYLOAD_ON false
#define LORA_IQ_INVERSION_ON false
#define RX_TIMEOUT_VALUE    1000
#define BUFFER_SIZE         100

#define STR_HELPER(x) #x
#define STR(x) STR_HELPER(x)

#define NODE_ID 2
const char* apSSID = "SkyNet_" STR(NODE_ID);
IPAddress apIP(192, 168, 4, 1);
IPAddress netMsk(255, 255, 255, 0);


char txpacket[BUFFER_SIZE];
char rxpacket[BUFFER_SIZE];
bool lora_idle = true;
static RadioEvents_t RadioEvents;

// ---- OLED ----
static SSD1306Wire display(0x3c, 500000, SDA_OLED, SCL_OLED, GEOMETRY_128_64, RST_OLED);


DNSServer dnsServer;
AsyncWebServer server(80);

// ================== HELPERS ==================
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

// ================== LoRa CALLBACKS ==================
void OnTxDone(void) {
  showOLED("LoRa TX done", txpacket);
  lora_idle = true;
}

void OnTxTimeout(void) {
  showOLED("LoRa TX Timeout");
  lora_idle = true;
}

void OnRxDone(uint8_t *payload, uint16_t size, int16_t rssi, int8_t snr) {
  memcpy(rxpacket, payload, size);
  rxpacket[size] = '\0';
  Radio.Sleep();

  // Parse header: "SRC=ID:message"
  String msg = String(rxpacket);
  if (msg.startsWith("SRC=")) {
    int sep = msg.indexOf(':');
    int src = msg.substring(4, sep).toInt();
    String content = msg.substring(sep + 1);

    if (src != NODE_ID) {
      // Show received data
      showOLED("LoRa RX", "From Node " + String(src), content, "RSSI " + String(rssi));
      delay(5000);

      // Rebroadcast
      if (lora_idle) {
        sprintf(txpacket, "%s", msg.c_str());
        Radio.Send((uint8_t *)txpacket, strlen(txpacket));
        lora_idle = false;
        showOLED("Rebroadcasting", content);
      }
    }
  }

  lora_idle = true;
}

// ================== SETUP ==================
void setup() {
  Serial.begin(115200);
  Mcu.begin(HELTEC_BOARD, SLOW_CLK_TPYE);

  // OLED
  VextON();
  delay(100);
  display.init();
  showOLED("Starting Node...", "ID: " + String(NODE_ID));

  // WiFi AP
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(apIP, apIP, netMsk);
  WiFi.softAP(apSSID);
  dnsServer.start(53, "*", apIP);

  // Captive Portal Form
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/html",
      "<h2>LoRa Node " + String(NODE_ID) + "</h2>"
      "<form action=\"/submit\">"
      "Name: <input type='text' name='name'><br>"
      "Info: <input type='text' name='info'><br>"
      "<input type='submit' value='Send'>"
      "</form>");
  });

  // Handle submit
  server.on("/submit", HTTP_GET, [](AsyncWebServerRequest *request) {
    String name, info;
    if (request->hasParam("name")) name = request->getParam("name")->value();
    if (request->hasParam("info")) info = request->getParam("info")->value();

    String payload = "SRC=" + String(NODE_ID) + ":" + name + "-" + info;
    sprintf(txpacket, "%s", payload.c_str());

    if (lora_idle) {
      Radio.Send((uint8_t *)txpacket, strlen(txpacket));
      lora_idle = false;
      showOLED("LoRa TX", name, info);
    }
    request->send(200, "text/html", "<h3>Sent via LoRa!</h3>");
  });

  server.begin();
  showOLED("AP Started", apSSID, "IP: " + WiFi.softAPIP().toString());

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

// ================== LOOP ==================
void loop() {
  dnsServer.processNextRequest();
  Radio.IrqProcess();
}
