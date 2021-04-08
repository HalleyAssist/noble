const os = require('os');

module.exports = function (options) {
  const platform = os.platform();

  if (platform === 'linux' || platform === 'freebsd' || platform === 'win32') {
    return new (require('./hci-socket/bindings'))(options);
  } else {
    throw new Error('Unsupported platform');
  }
};
