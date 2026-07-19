var crypto = require("crypto");

var minimumLength = 8;

function hash(password, salt, callback) {
  crypto.scrypt(password, salt, 64, function (error, key) {
    callback(error, key && key.toString("hex"));
  });
}

module.exports = {
  hash: hash,
  minimumLength: minimumLength
};
