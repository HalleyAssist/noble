const events = require('events'),
      util = require('util'),
      eventRequest = require('./event-request'),
      characteristics = require('./characteristics.json');

function Characteristic (noble, peripheralId, serviceUuid, uuid, properties) {
  this._noble = noble;
  this._peripheralId = peripheralId;
  this._serviceUuid = serviceUuid;

  this.uuid = uuid;
  this.name = null;
  this.type = null;
  this.properties = properties;
  this.descriptors = null;

  const characteristic = characteristics[uuid];
  if (characteristic) {
    this.name = characteristic.name;
    this.type = characteristic.type;
  }
}

util.inherits(Characteristic, events.EventEmitter);

Characteristic.prototype.toString = function () {
  return JSON.stringify({
    uuid: this.uuid,
    name: this.name,
    type: this.type,
    properties: this.properties
  });
};

Characteristic.prototype.readAsync = eventRequest.promisify(function(){
  this._noble.read(
    this._peripheralId,
    this._serviceUuid,
    this.uuid
  );
}, 'read', (data, isNotification) => {
  // only call the callback if 'read' event and non-notification
  // 'read' for non-notifications is only present for backwards compatbility
  if (!isNotification) {
    // call the callback
    return data
  }
})

Characteristic.prototype.writeAsync = eventRequest.promisify(function(data, withoutResponse){
  const allowedTypes = [
    Buffer,
    Uint8Array,
    Uint16Array,
    Uint32Array
  ];
  if (!allowedTypes.some((allowedType) => data instanceof allowedType)) {
    throw new Error(`data must be a ${allowedTypes.map((allowedType) => allowedType.name).join(' or ')}`);
  }
  this._noble.write(
    this._peripheralId,
    this._serviceUuid,
    this.uuid,
    data,
    withoutResponse
  );
}, 'write', () => true)

Characteristic.prototype.broadcastAsync = eventRequest.promisify(function(broadcast){
  this._noble.broadcast(
    this._peripheralId,
    this._serviceUuid,
    this.uuid,
    broadcast
  );
}, 'broadcast', ()=>true)


Characteristic.prototype.notifyAsync = eventRequest.promisify(function(notify){
  this._noble.notify(
    this._peripheralId,
    this._serviceUuid,
    this.uuid,
    notify
  );
}, 'notify', () => true)


Characteristic.prototype.subscribeAsync = function(){
  return this.notifyAsync(true)
}
Characteristic.prototype.unsubscribeAsync = function(){
  return this.notifyAsync(false)
}

Characteristic.prototype.discoverDescriptorsAsync = eventRequest.promisify(function(notify){
  this._noble.discoverDescriptors(
    this._peripheralId,
    this._serviceUuid,
    this.uuid
  );
}, 'descriptorsDiscover', descriptors => descriptors)


module.exports = Characteristic;
