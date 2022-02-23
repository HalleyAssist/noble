const { e } = require('./hci-socket/crypto');

const events = require('events'),
      eventRequest = require('./event-request'),
      Descriptor = require('./descriptor'),
      characteristics = require('./characteristics.json'),
      debug = require('debug')('noble:characteristic')

class Characteristic extends events.EventEmitter {
  constructor (service, uuid, properties, startHandle = null, valueHandle = null, endHandle = null){
    super()
    this.service = service

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
    this.endHandle = endHandle
  }


  emit(eventName, ...args) {
    if(eventName === 'notify'){
      debug(`event ${eventName}(${args[0]}) ${JSON.stringify(args[1])}`)
    }else{
      debug(`event ${eventName}`)
    }
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
  
  static fromDump(entry, peripheral, service){
    const ret = new Characteristic(service, entry.uuid, entry.properties, entry.startHandle, entry.valueHandle, entry.endHandle)
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
    valueHandle: this.valueHandle,
    endHandle: this.endHandle
  }
}

Characteristic.prototype.toString = function () {
  return JSON.stringify(this.dump());
};

Characteristic.prototype.readAsync = eventRequest.promisify(function(noble){
  noble.read(
    this.service.peripheral.id,
    this.service.uuid,
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

Characteristic.prototype.writeAsync = eventRequest.promisify(function(noble, data, withoutResponse){
  const allowedTypes = [
    Buffer,
    Uint8Array,
    Uint16Array,
    Uint32Array
  ];
  if (!allowedTypes.some((allowedType) => data instanceof allowedType)) {
    throw new Error(`data must be a ${allowedTypes.map((allowedType) => allowedType.name).join(' or ')}`);
  }
  noble.write(
    this.service.peripheral.id,
    this.service.uuid,
    this.uuid,
    data,
    withoutResponse
  );
}, 'write', () => true)

Characteristic.prototype.broadcastAsync = eventRequest.promisify(function(noble, broadcast){
  noble.broadcast(
    this.service.peripheral.id,
    this.service.uuid,
    this.uuid,
    broadcast
  );
}, 'broadcast', ()=>true)


Characteristic.prototype.notifyAsync = eventRequest.promisify(function(noble, notify, options = {}){
  noble.notify(
    this.service.peripheral.id,
    this.service.uuid,
    this.uuid,
    notify,
    options
  );
}, 'notify', (isNotification, success) => {
  if(success instanceof Error) throw success
  return true
})


Characteristic.prototype.subscribeAsync = function(noble, options = {}){
  return this.notifyAsync(noble, true, options)
}
Characteristic.prototype.unsubscribeAsync = function(noble, options = {}){
  return this.notifyAsync(noble, false, options)
}

Characteristic.prototype.discoverDescriptorsAsync = eventRequest.promisify(function(noble){
  noble.discoverDescriptors(
    this.service.peripheral.id,
    this.service.uuid,
    this.uuid
  );
}, 'descriptorsDiscover', descriptors => descriptors)


module.exports = Characteristic;
