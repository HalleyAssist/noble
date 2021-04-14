const events = require('events'),
      eventRequest = require('./event-request'),
      services = require('./services.json'),
      Characteristic = require('./characteristic'),
      debug = require('debug')('noble:service')

class Service extends events.EventEmitter {
  constructor(noble, peripheralId, uuid){
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
  }


  emit(eventName, ...args) {
    debug(`event ${eventName}`)
    return super.emit(eventName, ...args)
  }

  static fromDump(noble, entry, peripheral){
    const ret = new Service(noble, peripheral ? peripheral.id : null, entry.uuid)
    if(entry.characteristics) ret.characteristics = entry.characteristics.map(s=>Characteristic.fromDump(noble, s, peripheral, ret))
    return ret
  }
}

Service.prototype.dump = function(){
  return {
    uuid: this.uuid,
    includedServiceUuids: this.includedServiceUuids,
    characteristics: this.characteristics ? this.characteristics.map(c=>c.dump()) : null
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
