const events = require('events'),
      util = require('util'),
      eventRequest = require('./event-request'),
      Service = require('./service'),
      debug = require('debug')('noble:peripheral')

class Peripheral extends events.EventEmitter {
  constructor(noble, id, address, addressType, connectable, advertisement, rssi){
    super()

    this._noble = noble;

    this.id = id;
    this.uuid = id; // for legacy
    this.address = address;
    this.addressType = addressType;
    this.connectable = connectable;
    this.advertisement = advertisement;
    this.rssi = rssi;
    this.services = null;
    this.mtu = null;
    this.state = 'disconnected';
  }


  emit(eventName, ...args) {
    debug(`event ${eventName}`)
    return super.emit(eventName, ...args)
  }

  static fromDump(noble, entry){
    const ret = new Peripheral(noble, entry.id, entry.address, entry.addressType, entry.connectable, entry.advertisement, entry.rssi)
    if(entry.services) ret.services = entry.services.map(s=>Service.fromDump(noble, s, ret))
    return ret
  }
}

Peripheral.prototype.dump = function(){
  return {
    id: this.id,
    address: this.address,
    addressType: this.addressType,
    connectable: this.connectable,
    advertisement: this.advertisement,
    rssi: this.rssi,
    mtu: this.mtu,
    state: this.state,
    services: this.services ? this.services.map(c=>c.dump()) : null
  }
}

Peripheral.prototype.toString = function () {
  return JSON.stringify({
    id: this.id,
    address: this.address,
    addressType: this.addressType,
    connectable: this.connectable,
    advertisement: this.advertisement,
    rssi: this.rssi,
    mtu: this.mtu,
    state: this.state
  });
};

Peripheral.prototype.connectAsync = eventRequest.promisify(function(options){
  if (this.state === 'connected') {
    throw new Error('Peripheral already connected')
  }
  this.emit('connecting')
  this.state = 'connecting';
  return this._noble.connect(this.id, options);
}, 'connect', err=>err||true, {cancelFn: function(options){
  if(this.state === 'connecting'){
    this._noble.cancelConnect(this.id, options);
  }
}})

Peripheral.prototype.disconnectAsync = eventRequest.promisify(function(){
  this.emit('disconnecting')
  this.state = 'disconnecting';
  return this._noble.disconnect(this.id);
}, 'disconnect', err=>err||true, {retryCount:0})

Peripheral.prototype.updateRssiAsync = eventRequest.promisify(function(){
  return this._noble.updateRssi(this.id);
}, 'rssiUpdate', rssi=>rssi)

Peripheral.prototype.discoverServicesAsync = eventRequest.promisify(function(uuids){
  return this._noble.discoverServices(this.id, uuids);
}, 'servicesDiscover', services=>services)


Peripheral.prototype.discoverSomeServicesAndCharacteristicsAsync = function (serviceUuids, characteristicsUuids) {
    return eventRequest.cancelify(async(cancelSet)=>{
      let cancelled = false
      let p = this.discoverServicesAsync(serviceUuids)
      cancelSet(()=>{
        p.cancel()
        cancelled = true
      })

      const services = await p
      if(cancelled) throw new Error('cancelled')
      if (services.length < serviceUuids.length) throw new Error('Could not find all requested services')
    
      let numDiscovered = 0;
      const allCharacteristics = [];
    
      for (const i in services) {
        const service = services[i];
    
        let discoverUids = characteristicsUuids
        if(!Array.isArray(discoverUids)) discoverUids = characteristicsUuids[service.uuid]
        if(!discoverUids) continue

        p = service.discoverCharacteristicsAsync(discoverUids)
        const characteristics = await p
        if(cancelled) throw new Error('cancelled')
          
        numDiscovered++;
    
        // TODO: handle `error`?
        for (const j in characteristics) {
          const characteristic = characteristics[j];
    
          allCharacteristics.push(characteristic);
        }
      }
    
      return {services, characteristics:allCharacteristics}
  })
}

Peripheral.prototype.discoverAllServicesAndCharacteristicsAsync = function () {
  return eventRequest.cancelify(async(cancelSet)=>{
    let p = this.discoverSomeServicesAndCharacteristicsAsync([], [])
    cancelSet(()=>p.cancel())
    return await p
  })
};

const readHandle = function (handle, callback) {
  if (callback) {
    this.once(`handleRead${handle}`, data => {
      callback(null, data);
    });
  }

  this._noble.readHandle(this.id, handle);
};

Peripheral.prototype.readHandle = readHandle;
Peripheral.prototype.readHandleAsync = util.promisify(readHandle);

const writeHandle = function (handle, data, withoutResponse, callback) {
  if (!(data instanceof Buffer)) {
    throw new Error('data must be a Buffer');
  }

  if (callback) {
    this.once(`handleWrite${handle}`, () => {
      callback(null);
    });
  }

  this._noble.writeHandle(this.id, handle, data, withoutResponse);
};

Peripheral.prototype.writeHandle = writeHandle;
Peripheral.prototype.writeHandleAsync = util.promisify(writeHandle);

module.exports = Peripheral;
