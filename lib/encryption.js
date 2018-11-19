const crypto = require('crypto');
const ecdh = crypto.createECDH('prime256v1');
const algo = 'aes-256-cbc';

function computeSecret(keyPair, publicKey) {
    ecdh.setPrivateKey(keyPair.privateKey, 'hex');
    ecdh.setPublicKey(keyPair.publicKey, 'hex');
    return ecdh.computeSecret(publicKey, 'hex');
}

module.exports = {
    generateKeys(){
        ecdh.generateKeys('hex');
        return { privateKey: ecdh.getPrivateKey('hex'), publicKey: ecdh.getPublicKey('hex', 'compressed')}
    },

    encryptData(keyPair, publicKey, data) {
        let iv = "";
        let secret = computeSecret(keyPair, publicKey);
        let cipher = crypto.createCipheriv(algo, secret, iv);
        let encrypted = cipher.update(data, 'utf8','base64');
        encrypted += cipher.final('base64');
        return { data: encrypted, iv }
    },

    decryptData(keyPair, publicKey, iv, data) {
        let secret = computeSecret(keyPair, publicKey);
        var bufferIV = new Buffer(iv,'base64');
        let decipher = crypto.createDecipheriv(algo, new Buffer(secret), bufferIV);
        let decrypted = decipher.update(data, 'base64', "utf8");
        decrypted += decipher.final( "utf8");
        return decrypted;
    }
};