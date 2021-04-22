const events = require('events'),
      eventRequest = require('./event-request'),
      Descriptor = require('./descriptor'),
      characteristics = require('./characteristics.json'),
      debug = require('debug')('noble:characteristic')

class Characteristic extends events.EventEmitter {
  constructor (noble, peripheralId, serviceUuid, uuid, properties, startHandle = null, valueHandle = null){
    super()
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

    this.startHandle = startHandle
    this.valueHandle = valueHandle
  }


  emit(eventName, ...args) {
    debug(`event ${eventName}`)
    return super.emit(eventName, ...args)
  }

  onRead(data, isNotification){
    if(isNotification) this.emit('notification', data)
    this.emit('read', data, isNotification);
  }

  onWrite() {
    this.emit('write');
  }

  onBroadcast(state) {
    this.emit('broadcast', state);
  }

  onNotify(state, success) {
    this.emit('notify', state, success);
  }

  getDescriptor(dId){
    if(!this.descriptors) return null
    for(const d of this.descriptors){
      if(d.uuid == dId) return d
    }
    return null
  }
  _getDescriptor(dId) {
    const d = this.getDescriptor(dId)
    if(!d) throw new Error(`Unable to find descriptor`)
    return d
  }
  addDescriptor(descriptorUuid){
    if(!this.descriptors) this.descriptors = []
    let descriptor
    if(descriptorUuid instanceof Descriptor) descriptor = descriptorUuid
    else descriptor = new Descriptor(
      this._noble,
      this._peripheralId,
      this._serviceUuid,
      this._characteristicUuid,
      descriptorUuid
    );
    this.descriptors.push(descriptor)
    return descriptor
  }

  onDescriptorsDiscover(descriptors) {
    const ret = []
    for(let dIn of descriptors){
      let d = this.getDescriptor(dIn)
      if(!d) d = this.addDescriptor(dIn)

      ret.push(d)
    }
    this.emit('descriptorsDiscover', ret);
  }

  onValueRead(descriptorUuid, data) {
    const d = this._getDescriptor(descriptorUuid)
    return d.onValueRead(data)
  }

  onValueWrite(descriptorUuid) {
    const d = this._getDescriptor(descriptorUuid)
    return d.onValueWrite()
  }
  
  static fromDump(noble, entry, peripheral, service){
    const ret = new Characteristic(noble, peripheral ? peripheral.id : null, service ? service.uuid : null, entry.uuid, entry.properties, entry.startHandle, entry.valueHandle)
    if(entry.descriptors) ret.descriptors = entry.descriptors.map(s=>Descriptor.fromDump(noble, s, peripheral, service, ret))
    return ret
  }
}

Characteristic.prototype.dump = function(){
  return {
    uuid: this.uuid,
    properties: this.properties,
    descriptors: this.descriptors ? this.descriptors.map(d=>d.dump()) : null,
    startHandle: this.startHandle,
    valueHandle: this.valueHandle
  }
}

Characteristic.prototype.toString = function () {
  return JSON.stringify(this.dump());
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
}, 'notify', (isNotification, success) => {
  if(success instanceof Error) throw success
  return true
})


Characteristic.prototype.subscribeAsync = function(){
  return this.notifyAsync(true)
}
Characteristic.prototype.unsubscribeAsync = function(){
  return this.notifyAsync(false)
}

Characteristic.prototype.discoverDescriptorsAsync = eventRequest.promisify(function(){
  this._noble.discoverDescriptors(
    this._peripheralId,
    this._serviceUuid,
    this.uuid
  );
}, 'descriptorsDiscover', descriptors => descriptors)


module.exports = Characteristic;
