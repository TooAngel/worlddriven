#!/usr/bin/env node

/**
 * Token Decryption Utility
 * 
 * Decrypts GitHub access tokens that were encrypted using SQLAlchemy-Utils
 * EncryptedType with AES encryption and PKCS5 padding.
 * 
 * Usage: node decrypt-tokens.js [--test "encrypted_string"]
 */

import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'ahbaofa4hae7IeBoh1PhaaXeitieV7';

/**
 * Decrypt a token encrypted with SQLAlchemy-Utils EncryptedType
 * @param {string} encryptedToken Base64 encoded encrypted token
 * @returns {string} Decrypted token
 */
export function decryptToken(encryptedToken) {
  try {
    // SQLAlchemy-Utils uses AES with PKCS5 padding
    // The encrypted data is base64 encoded
    const encrypted = Buffer.from(encryptedToken, 'base64');
    
    // Create a proper 32-byte key for AES-256 by hashing the encryption key
    const keyHash = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    
    // Extract IV and encrypted data
    // SQLAlchemy-Utils typically puts IV at the beginning
    const ivLength = 16; // AES block size
    const iv = encrypted.subarray(0, ivLength);
    const encryptedData = encrypted.subarray(ivLength);
    
    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyHash, iv);
    decipher.setAutoPadding(true); // Handle PKCS5 padding
    
    // Decrypt
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error(`Error decrypting token: ${error.message}`);
    throw new Error(`Failed to decrypt token: ${error.message}`);
  }
}

/**
 * Test decryption with a sample token
 */
function testDecryption() {
  const testToken = process.argv.find((arg, i) => process.argv[i-1] === '--test');
  
  if (!testToken) {
    console.log('Usage: node decrypt-tokens.js --test "encrypted_token_string"');
    console.log('Example: node decrypt-tokens.js --test "k+n8vospSptBydGXEon4MMCTefXYWiR1yzGh+TJWZRxm1Lr+RKHpeJ4Me/oHTkja"');
    return;
  }
  
  console.log('🔓 Testing token decryption...');
  console.log(`Encryption key: ${ENCRYPTION_KEY.substring(0, 8)}...`);
  console.log(`Encrypted token: ${testToken.substring(0, 20)}...`);
  
  try {
    const decrypted = decryptToken(testToken);
    console.log(`✅ Decrypted successfully!`);
    console.log(`Decrypted token: ${decrypted.substring(0, 8)}...`);
    
    // Basic validation - GitHub tokens start with 'ghp_' or 'gho_' for newer tokens
    if (decrypted.startsWith('ghp_') || decrypted.startsWith('gho_') || decrypted.length >= 40) {
      console.log('✅ Token format looks valid');
    } else {
      console.log('⚠️ Token format might be invalid');
    }
  } catch (error) {
    console.error('❌ Decryption failed:', error.message);
    
    console.log('\n💡 Troubleshooting:');
    console.log('1. Check if ENCRYPTION_KEY environment variable is correct');
    console.log('2. Verify the encrypted token is base64 encoded');
    console.log('3. Ensure the encryption algorithm matches SQLAlchemy-Utils settings');
  }
}

// Run test if called directly
if (process.argv[1].endsWith('decrypt-tokens.js')) {
  testDecryption();
}