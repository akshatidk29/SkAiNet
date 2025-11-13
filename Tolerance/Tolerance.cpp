#include <iostream>
#include <vector>
#include <openssl/aes.h>
#include <iomanip>
#include <sstream>
#include <random>

// ========== Utility ==========
std::string toHex(const std::vector<unsigned char>& data) {
    std::ostringstream oss;
    for (auto b : data)
        oss << std::hex << std::setw(2) << std::setfill('0') << (int)b;
    return oss.str();
}

// ========== AES Padding ==========
void addPadding(std::vector<unsigned char>& data) {
    size_t padLen = AES_BLOCK_SIZE - (data.size() % AES_BLOCK_SIZE);
    data.insert(data.end(), padLen, static_cast<unsigned char>(padLen));
}
void removePadding(std::vector<unsigned char>& data) {
    if (data.empty()) return;
    unsigned char pad = data.back();
    if (pad > 0 && pad <= AES_BLOCK_SIZE && pad <= data.size())
        data.resize(data.size() - pad);
}

// ========== AES Core ==========
std::vector<unsigned char> aesEncrypt(std::vector<unsigned char> plaintext, const uint8_t* key) {
    AES_KEY encryptKey;
    AES_set_encrypt_key(key, 128, &encryptKey);
    addPadding(plaintext);
    std::vector<unsigned char> ciphertext(plaintext.size());
    for (size_t i = 0; i < plaintext.size(); i += AES_BLOCK_SIZE)
        AES_encrypt(&plaintext[i], &ciphertext[i], &encryptKey);
    return ciphertext;
}

std::vector<unsigned char> aesDecrypt(const std::vector<unsigned char>& ciphertext, const uint8_t* key) {
    AES_KEY decryptKey;
    AES_set_decrypt_key(key, 128, &decryptKey);
    std::vector<unsigned char> plaintext(ciphertext.size());
    for (size_t i = 0; i < ciphertext.size(); i += AES_BLOCK_SIZE)
        AES_decrypt(&ciphertext[i], &plaintext[i], &decryptKey);
    removePadding(plaintext);
    return plaintext;
}

// ========== Hamming(7,4) ==========
uint8_t hammingEncodeNibble(uint8_t nibble) {
    uint8_t d1 = (nibble >> 3) & 1;
    uint8_t d2 = (nibble >> 2) & 1;
    uint8_t d3 = (nibble >> 1) & 1;
    uint8_t d4 = nibble & 1;

    uint8_t p1 = d1 ^ d2 ^ d4;
    uint8_t p2 = d1 ^ d3 ^ d4;
    uint8_t p3 = d2 ^ d3 ^ d4;

    return (p1 << 6) | (p2 << 5) | (d1 << 4) | (p3 << 3) | (d2 << 2) | (d3 << 1) | d4;
}

uint8_t hammingDecodeByte(uint8_t code, bool& corrected) {
    uint8_t p1 = (code >> 6) & 1;
    uint8_t p2 = (code >> 5) & 1;
    uint8_t d1 = (code >> 4) & 1;
    uint8_t p3 = (code >> 3) & 1;
    uint8_t d2 = (code >> 2) & 1;
    uint8_t d3 = (code >> 1) & 1;
    uint8_t d4 = code & 1;

    uint8_t c1 = p1 ^ d1 ^ d2 ^ d4;
    uint8_t c2 = p2 ^ d1 ^ d3 ^ d4;
    uint8_t c3 = p3 ^ d2 ^ d3 ^ d4;

    int syndrome = (c3 << 2) | (c2 << 1) | c1;
    corrected = false;

    if (syndrome != 0 && syndrome <= 7) {
        code ^= (1 << (7 - syndrome));
        corrected = true;
    }

    d1 = (code >> 4) & 1;
    d2 = (code >> 2) & 1;
    d3 = (code >> 1) & 1;
    d4 = code & 1;

    return (d1 << 3) | (d2 << 2) | (d3 << 1) | d4;
}

// Encode ciphertext with Hamming(7,4)
std::vector<unsigned char> applyHamming(const std::vector<unsigned char>& data) {
    std::vector<unsigned char> encoded;
    for (unsigned char byte : data) {
        uint8_t high = hammingEncodeNibble(byte >> 4);
        uint8_t low = hammingEncodeNibble(byte & 0x0F);
        encoded.push_back(high);
        encoded.push_back(low);
    }
    return encoded;
}

// Decode and correct
std::vector<unsigned char> decodeHamming(const std::vector<unsigned char>& encoded) {
    std::vector<unsigned char> decoded;
    for (size_t i = 0; i < encoded.size(); i += 2) {
        bool c1 = false, c2 = false;
        uint8_t high = hammingDecodeByte(encoded[i], c1);
        uint8_t low = hammingDecodeByte(encoded[i + 1], c2);
        decoded.push_back((high << 4) | low);
    }
    return decoded;
}

// ========== Noise Simulation ==========
void flipBits(std::vector<unsigned char>& data, int numBits) {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dist(0, data.size() * 8 - 1);
    for (int i = 0; i < numBits; ++i) {
        int bitPos = dist(gen);
        data[bitPos / 8] ^= (1 << (bitPos % 8));
    }
}

// ========== Main ==========
int main() {
    std::string message = "This is a secret message";
    std::vector<unsigned char> plaintext(message.begin(), message.end());
    uint8_t key[16] = { 0x00,0x11,0x22,0x33,0x44,0x55,0x66,0x77,
                        0x88,0x99,0xaa,0xbb,0xcc,0xdd,0xee,0xff };

    auto ciphertext = aesEncrypt(plaintext, key);
    auto encoded = applyHamming(ciphertext);

    std::cout << "Ciphertext (Hamming encoded): " << toHex(encoded) << "\n\n";

    for (int bits = 0; bits <= 25; ++bits) {
        auto corrupted = encoded;
        flipBits(corrupted, bits);

        auto corrected = decodeHamming(corrupted);
        auto decrypted = aesDecrypt(corrected, key);
        std::string text(decrypted.begin(), decrypted.end());

        std::cout << bits << " bits flipped -> " << text << "\n";
    }
}
