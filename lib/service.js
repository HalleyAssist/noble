const events = require('events'),
      eventRequest = require('./event-request'),
      services = require('./services.json'),
      Characteristic = require('./characteristic'),
      debug = require('debug')('noble:service')

class Service extends events.EventEmitter {
  constructor(noble, peripheralId, uuid, startHandle = null, endHandle = null){
    super()
    this._noble = noble;
    this._peripheralId = peripheralId;

    this.uuid = uuid;
    this.name = null;
    this.type = null;
    this.includedServiceUuids = null;
    this.characteristics = null;

    const service = services[uuid];
    if (service) {
      this.name = service.name;
      this.type = service.type;
    }

    this.startHandle = startHandle
    this.endHandle = endHandle
  }


  emit(eventName, ...args) {
    debug(`event ${eventName}`)
    return super.emit(eventName, ...args)
  }

  getCharacteristic(cId){
    if(this.characteristics === null) return null
    if(typeof cId === 'number') cId = cId.toString(16)
    for(const c of this.characteristics){
      if(c.uuid == cId) return c
    }
    return null
  }
  _getCharacteristic(cId){
    const c = this.getCharacteristic(cId)
    if(!c) throw new Error(`Unknown characteristic`)
    return c
  }

  addCharacteristic(c){
    if(!this.characteristics) this.characteristics = []
    if(!(c instanceof Characteristic)){
      c = new Characteristic(
        this._noble,
        this._peripheralId,
        this.uuid,
        c.uuid,
        c.properties
      );
    }

    this.characteristics.push(c);
    return c
  }

  onCharacteristicsDiscover(characteristics) {
    const ret = []
    for(const c of characteristics){
      let cObj = this.getCharacteristic(c.uuid)
      if(!cObj) cObj = this.addCharacteristic(c)

      Object.assign(cObj, c)

      ret.push(cObj)
    }

    this.emit('characteristicsDiscover', ret);
  }

  onRead(characteristicUuid, data, isNotification) {
    const c = this._getCharacteristic(characteristicUuid)
    return c.onRead(data, isNotification)
  }

  onWrite(characteristicUuid) {
    const c = this._getCharacteristic(characteristicUuid)
    return c.onWrite()
  }
  
  onBroadcast(characteristicUuid, state) {
    const c = this._getCharacteristic(characteristicUuid)
    return c.onBroadcast(state)
  }
  
  onNotify(characteristicUuid, state, success) {
    const c = this._getCharacteristic(characteristicUuid)
    return c.onNotify(state, success)
  }

  onDescriptorsDiscover(characteristicUuid, descriptors) {
    const c = this._getCharacteristic(characteristicUuid)
    return c.onDescriptorsDiscover(descriptors)
  }

  onValueRead(characteristicUuid, descriptorUuid, data) {
    const c = this._getCharacteristic(characteristicUuid)
    return c.onValueRead(descriptorUuid, data)
  }

  onValueWrite(characteristicUuid, descriptorUuid) {
    const c = this._getCharacteristic(characteristicUuid)
    return c.onValueWrite(descriptorUuid)
  }

  static fromDump(noble, entry, peripheral){
    const ret = new Service(noble, peripheral ? peripheral.id : null, entry.uuid, entry.startHandle, entry.endHandle)
    if(entry.characteristics) ret.characteristics = entry.characteristics.map(s=>Characteristic.fromDump(noble, s, peripheral, ret))
    return ret
  }
}

Service.prototype.dump = function(){
  return {
    uuid: this.uuid,
    includedServiceUuids: this.includedServiceUuids,
    characteristics: this.characteristics ? this.characteristics.map(c=>c.dump()) : null,
    startHandle: this.startHandle,
    endHandle: this.endHandle
  }
}

Service.prototype.toString = function () {
  return JSON.stringify({
    uuid: this.uuid,
    name: this.name,
    type: this.type,
    includedServiceUuids: this.includedServiceUuids
  });
};

Service.prototype.discoverIncludedServicesAsync = eventRequest.promisify(function(serviceUuids){
  return this._noble.discoverIncludedServices(
    this._peripheralId,
    this.uuid,
    serviceUuids
  );
}, 'includedServicesDiscover', includedServiceUuids=>includedServiceUuids)

Service.prototype.discoverCharacteristicsAsync = eventRequest.promisify(function(characteristicUuids){
  return this._noble.discoverCharacteristics(
    this._peripheralId,
    this.uuid,
    characteristicUuids
  );
}, 'characteristicsDiscover', characteristics=>characteristics)

module.exports = Service;
