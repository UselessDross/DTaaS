// src/utils/EncryptedSecrets.ts

import * as fs from 'fs/promises';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV
const TAG_LENGTH = 16; // 128-bit GCM tag

const SECRET_KEY = process.env.SECRET_KEY;
if (!SECRET_KEY || SECRET_KEY.length !== 64) { throw new Error('SECRET_KEY must be a 64-character hex string (32 bytes)'); }

function getKey(): Buffer { return Buffer.from(SECRET_KEY!, 'hex'); }

export async function encrypt(text: string): Promise<Buffer> {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getKey();

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]);
}

export async function decrypt(encrypted: Buffer): Promise<string> {
    const iv = encrypted.slice(0, IV_LENGTH);
    const tag = encrypted.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const data = encrypted.slice(IV_LENGTH + TAG_LENGTH);

    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
}

export async function saveSecretsToFile(obj: object, filePath: string): Promise<void> {
    const plain = JSON.stringify(obj);
    const encrypted = await encrypt(plain);
    await fs.writeFile(filePath, encrypted);
}

export async function loadSecretsFromFile(filePath: string): Promise<object> {
    const encrypted = await fs.readFile(filePath);
    const plain = await decrypt(encrypted);
    return JSON.parse(plain);
}
