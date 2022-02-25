const events = require('events'),
      util = require('util'),
      eventRequest = require('./event-request'),
      Service = require('./service'),
      debug = require('debug')('noble:peripheral')

class Peripheral extends events.EventEmitter {
  constructor(id, address, addressType, connectable, advertisement, rssi){
    super()

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
    this.lastSeen = Date.now()/1000
  }

  refreshState(){

  }

  get connected(){
    return this.state === 'connected'
  }

  get connecting(){
    return this.state === 'connecting'
  }


  emit(eventName, ...args) {
    debug(`event ${eventName}`)
    return super.emit(eventName, ...args)
  }

  static fromDump(entry){
    const ret = new Peripheral(entry.id, entry.address, entry.addressType, entry.connectable, entry.advertisement, entry.rssi)
    if(entry.services) ret.services = entry.services.map(s=>Service.fromDump(s, ret))
    return ret
  }

  addService(service){
    if (!this.services) this.services = [];

    // allocate internal service object and return
    if(!(service instanceof Service)) service = new Service(this, service);

    this.services.push(service);

    return service;
  }

  getCharacteristic(id){
    if(!this.services) return null
    if(typeof id === 'number') id = id.toString(16)
    for(const s of this.services){
      const c = s.getCharacteristic(id)
      if(c) return c
    }
    return null
  }

  getService(id) {
    if(this.services === null) return null
    if(typeof id === 'number') id = id.toString(16)
    for(const s of this.services) {
      if(s.uuid == id) return s
    }
    return null
  }

  _getService(id){
    const service = this.getService(id)
    if(!service) throw new Error(`unknown service`)
    return service
  }

  mergeServicesTo(targetPeripheral){
    for(const s of this.services){
      let targetService = targetPeripheral.getService(s.uuid)
      if(!targetService){
        targetService = targetPeripheral.addService(s)
      }
      
      if(targetService.characteristics == null || targetService.characteristics.length == 0){
        targetService.characteristics = s.characteristics
      }

      if(!targetService.startHandle) targetService.startHandle = s.startHandle
      if(!targetService.endHandle) targetService.endHandle = s.endHandle
    }
  }


  onServicesDiscover(serviceUuids) {
    const ret = []
    for(const service of serviceUuids){
      let sObj = this.getService(service.uuid)
      if(!sObj) sObj = this.addService(service.uuid)

      Object.assign(sObj, service)

      ret.push(sObj)
    }

    this.emit('servicesDiscover', ret);
  }
  onIncludedServicesDiscover(serviceUuid, includedServiceUuids) {
    const service = this._getService(serviceUuid)

    service.includedServiceUuids = includedServiceUuids;
    service.emit('includedServicesDiscover', includedServiceUuids);
  }
  addCharacteristics(serviceUuid, characteristics) {
    const service = this._getService(serviceUuid)

    const ret = []
    for(const c of characteristics){
      ret.push(service.addCharacteristic(c))
    }
    return ret
  }

  onCharacteristicsDiscover(serviceUuid, characteristics) {
    const service = this._getService(serviceUuid)
    return service.onCharacteristicsDiscover(characteristics)
  }

  onRead(serviceUuid, characteristicUuid, data, isNotification) {
    const service = this._getService(serviceUuid)
    return service.onRead(characteristicUuid, data, isNotification)
  }

  onWrite(serviceUuid, characteristicUuid) {
    const service = this._getService(serviceUuid)
    return service.onWrite(characteristicUuid)
  }
  
  onBroadcast(serviceUuid, characteristicUuid, state) {
    const service = this._getService(serviceUuid)
    return service.onBroadcast(characteristicUuid, state)
  }

  onNotify(serviceUuid, characteristicUuid, state, success) {
    const service = this._getService(serviceUuid)
    return service.onNotify(characteristicUuid, state, success)
  }

  onDescriptorsDiscover(serviceUuid, characteristicUuid, descriptors) {
    const service = this._getService(serviceUuid)
    return service.onDescriptorsDiscover(characteristicUuid, descriptors)
  }

  onValueRead(serviceUuid, characteristicUuid, descriptorUuid, data) {
    const service = this._getService(serviceUuid)
    return service.onValueRead(characteristicUuid, descriptorUuid, data)
  }

  onValueWrite(serviceUuid, characteristicUuid, descriptorUuid) {
    const service = this._getService(serviceUuid)
    return service.onValueWrite(characteristicUuid, descriptorUuid)
  }
  onHandleRead(handle, data) {
    this.emit(`handleRead${handle}`, data);
  }
  onHandleWtite(handle){
    this.emit(`handleWrite${handle}`);
  }
  onHandleNotify(handle, data) {
    this.emit('handleNotify', handle, data);
  }
  onConnect(error){
    if(error && this.state === 'connected'){
      this.onDisconnect()
    }
    this.state = error ? 'error' : 'connected';
    this.emit('connect', error)
  }
  onDisconnect(){
    this.state = 'disconnected';
    this.emit('disconnect');
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

Peripheral.prototype.connectAsync = eventRequest.promisify(function(noble, options){
  if (this.state === 'connected') {
    return
  }
  this.emit('connecting')
  this.state = 'connecting';
  return noble.connect(this, options);
}, 'connect', err=>err||true, {cancelFn: function(noble, options){
  if(this.state === 'connecting'){
    noble.cancelConnect(this.id, options);
  }
}})

Peripheral.prototype.disconnectAsync = eventRequest.promisify(function(noble){
  this.emit('disconnecting')
  this.state = 'disconnecting';
  return noble.disconnect(this.id);
}, 'disconnect', err=>err||true, {retryCount:0})

Peripheral.prototype.updateRssiAsync = eventRequest.promisify(function(noble){
  return noble.updateRssi(this.id);
}, 'rssiUpdate', rssi=>rssi)

Peripheral.prototype.discoverServicesAsync = eventRequest.promisify(function(noble, uuids){
  return noble.discoverServices(this.id, uuids);
}, 'servicesDiscover', services=>services)

Peripheral.prototype.encrypt = function(noble) {
  return noble.encrypt(this.id);
}

Peripheral.prototype.discoverSomeServicesAndCharacteristicsAsync = function (noble, serviceUuids, characteristicsUuids) {
    return eventRequest.cancelify(async(cancelSet)=>{
      let cancelled = false
      let p = this.discoverServicesAsync(noble, serviceUuids)
      cancelSet(()=>{
        p.cancel()
        cancelled = true
      })

      const services = await p
      if(cancelled) throw new Error('cancelled')
      if (services.length < serviceUuids.length) throw new Error('Could not find all requested services')
    
      const allCharacteristics = [];
    
      for (const i in services) {
        const service = services[i];
    
        if(characteristicsUuids && !characteristicsUuids.includes(service.uuid)) continue

        p = service.discoverCharacteristicsAsync(noble)
        const characteristics = await p
        if(cancelled) throw new Error('cancelled')
        
    
        // TODO: handle `error`?
        for (const j in characteristics) {
          const characteristic = characteristics[j];
    
          allCharacteristics.push(characteristic);
        }
      }
    
      return {services, characteristics:allCharacteristics}
  })
}

Peripheral.prototype.discoverAllServicesAndCharacteristicsAsync = function (noble) {
  return eventRequest.cancelify(async(cancelSet)=>{
    let p = this.discoverSomeServicesAndCharacteristicsAsync(noble, [], [])
    cancelSet(()=>p.cancel())
    return await p
  })
};

const readHandle = function (noble, handle, callback) {
  if (callback) {
    this.once(`handleRead${handle}`, data => {
      callback(null, data);
    });
  }

  noble.readHandle(this.id, handle);
};

Peripheral.prototype.readHandle = readHandle;
Peripheral.prototype.readHandleAsync = util.promisify(readHandle);

const writeHandle = function (noble, handle, data, withoutResponse, callback) {
  if (!(data instanceof Buffer)) {
    throw new Error('data must be a Buffer');
  }

  if (callback) {
    this.once(`handleWrite${handle}`, () => {
      callback(null);
    });
  }

  noble.writeHandle(this.id, handle, data, withoutResponse);
};

Peripheral.prototype.writeHandle = writeHandle;
Peripheral.prototype.writeHandleAsync = util.promisify(writeHandle);

module.exports = Peripheral;
