const crypto = require("crypto")

const ecdh = crypto.createECDH("prime256v1")
ecdh.generateKeys()

const publicKey = ecdh.getPublicKey()
const rawPrivateKey = ecdh.getPrivateKey()
const privateKey = Buffer.alloc(32)
rawPrivateKey.copy(privateKey, 32 - rawPrivateKey.length)

console.log(`VAPID_PUBLIC_KEY=${publicKey.toString("base64url")}`)
console.log(`VAPID_PRIVATE_KEY=${privateKey.toString("base64url")}`)
console.log("VAPID_SUBJECT=mailto:replace-with-admin-contact@example.com")
