#include <Wire.h>
#include "LoRaWan_APP.h"
#include "Arduino.h"
#include "HT_SSD1306Wire.h"

// ================= LoRa Config ==================
#define RF_FREQUENCY 866000000  // Hz (India ISM: 865–867 MHz)
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

#define NODE_ID 99

// ================= Globals ==================
char rxpacket[BUFFER_SIZE];
bool lora_idle = true;
static RadioEvents_t RadioEvents;

// Message cache (for duplicate filtering)
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

// ================= OLED ==================
static SSD1306Wire display(0x3c, 500000, SDA_OLED, SCL_OLED,
                           GEOMETRY_128_64, RST_OLED);

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

// ================= LoRa Callbacks ==================
void OnTxDone(void) {
  lora_idle = true;
  Radio.Rx(0);
}

void OnRxDone(uint8_t *payload, uint16_t size, int16_t rssi, int8_t snr) {
  memcpy(rxpacket, payload, size);
  rxpacket[size] = '\0';
  Radio.Sleep();

  String msg = String(rxpacket);
  Serial.println(msg);

  int sep = msg.indexOf(':');
  if (sep == -1) {
    Radio.Rx(0);
    return;
  }

  String header = msg.substring(0, sep);
  String content = msg.substring(sep + 1);

  int src = -1, cur = -1, msgId = -1;
  sscanf(header.c_str(), "SRC=%d,CUR=%d,MSG=%d", &src, &cur, &msgId);

  if (!seenMessage(src, msgId)) {
    addToCache(src, msgId);
    showOLED("LoRa RX", "From " + String(src), content, "RSSI " + String(rssi));
    Serial.println("[DEBUG] Not Duplicate");
  } else {
    Serial.println("[DEBUG] Duplicate message ignored.");
  }

  Radio.Rx(0);
}

// ================= Setup ==================
void setup() {
  Serial.begin(115200);
  Mcu.begin(HELTEC_BOARD, SLOW_CLK_TPYE);

  // OLED setup
  VextON();
  delay(100);
  display.init();
  showOLED("Starting Node...", "ID: " + String(NODE_ID));
  delay(1000);

  // LoRa init
  RadioEvents.TxDone = OnTxDone;
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

// ================= Loop ==================
void loop() {
  Radio.IrqProcess();
}
