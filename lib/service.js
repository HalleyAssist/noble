const events = require('events'),
      util = require('util'),
      eventRequest = require('./event-request'),
      services = require('./services.json');

function Service (noble, peripheralId, uuid) {
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

util.inherits(Service, events.EventEmitter);

Service.prototype.toString = function () {
  return JSON.stringify({
    uuid: this.uuid,
    name: this.name,
    type: this.type,
    includedServiceUuids: this.includedServiceUuids
  });
};

Service.prototype.discoverIncludedServicesAsync = eventRequest.promisify(function(serviceUuids){
  this._noble.discoverIncludedServices(
    this._peripheralId,
    this.uuid,
    serviceUuids
  );
}, 'includedServicesDiscover', includedServiceUuids=>includedServiceUuids)

Service.prototype.discoverCharacteristicsAsync = eventRequest.promisify(function(characteristicUuids){
  this._noble.discoverCharacteristics(
    this._peripheralId,
    this.uuid,
    characteristicUuids
  );
}, 'characteristicsDiscover', characteristics=>characteristics)

module.exports = Service;
