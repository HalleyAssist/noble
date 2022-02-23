const events = require('events');
const util = require('util');

const descriptors = require('./descriptors.json');

class Descriptor extends events.EventEmitter {
  constructor(characteristic, uuid) {
    super()
    this.characteristic = characteristic;

    this.uuid = uuid;
    this.name = null;
    this.type = null;

    const descriptor = descriptors[uuid];
    if (descriptor) {
      this.name = descriptor.name;
      this.type = descriptor.type;
    }
  }

  onValueRead(data) {
    this.emit('valueRead', data);
  }

  onValueWrite(){
    this.emit('valueWrite');
  }

  static fromDump(entry, characteristic){
    return new Descriptor(characteristic, entry.uuid)
  }
}

Descriptor.prototype.dump = function(){
  return {
    uuid: this.uuid
  }
}

Descriptor.prototype.toString = function () {
  return JSON.stringify({
    uuid: this.uuid,
    name: this.name,
    type: this.type
  });
};

const readValue = function (noble, callback) {
  if (callback) {
    this.once('valueRead', data => {
      callback(null, data);
    });
  }
  noble.readValue(
    this.characteristic.service.peripheral.id,
    this.characteristic.service.uuid,
    this.characteristic.uuid,
    this.uuid
  );
};

Descriptor.prototype.readValue = readValue;
Descriptor.prototype.readValueAsync = util.promisify(readValue);

const writeValue = function (noble, data, callback) {
  if (!(data instanceof Buffer)) {
    throw new Error('data must be a Buffer');
  }

  if (callback) {
    this.once('valueWrite', () => {
      callback(null);
    });
  }
  noble.writeValue(
    this.characteristic.service.peripheral.id,
    this.characteristic.service.uuid,
    this.characteristic.uuid,
    this.uuid,
    data
  );
};

Descriptor.prototype.writeValue = writeValue;
Descriptor.prototype.writeValueAsync = util.promisify(writeValue);

module.exports = Descriptor;
