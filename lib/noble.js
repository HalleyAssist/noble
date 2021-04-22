const events = require('events'),
      util = require('util'),
      PeripheralDb = require('./peripheraldb'),
      debug = require('debug')('noble');

const Peripheral = require('./peripheral');
class Noble extends events.EventEmitter {
  constructor(bindings) {
    super()
    this.initialized = false;

    this.address = 'unknown';
    this._state = 'unknown';
    this._bindings = bindings;
    bindings._noble = this
    this.peripherals = new PeripheralDb();
    this._discoveredPeripheralUUids = [];

    this._bindings.on('stateChange', this.onStateChange.bind(this));
    this._bindings.on('addressChange', this.onAddressChange.bind(this));
    this._bindings.on('scanParametersSet', this.onScanParametersSet.bind(this));
    this._bindings.on('scanStart', this.onScanStart.bind(this));
    this._bindings.on('scanStop', this.onScanStop.bind(this));
    this._bindings.on('discover', this.onDiscover.bind(this));
    this._bindings.on('connect', this.onConnect.bind(this));
    this._bindings.on('disconnect', this.onDisconnect.bind(this));
    this._bindings.on('rssiUpdate', this.onRssiUpdate.bind(this));
    this._bindings.on('servicesDiscover', this.onServicesDiscover.bind(this));
    this._bindings.on('includedServicesDiscover', this.onIncludedServicesDiscover.bind(this));
    this._bindings.on('characteristicsDiscover', this.onCharacteristicsDiscover.bind(this));
    this._bindings.on('read', this.onRead.bind(this));
    this._bindings.on('write', this.onWrite.bind(this));
    this._bindings.on('broadcast', this.onBroadcast.bind(this));
    this._bindings.on('notify', this.onNotify.bind(this));
    this._bindings.on('descriptorsDiscover', this.onDescriptorsDiscover.bind(this));
    this._bindings.on('valueRead', this.onValueRead.bind(this));
    this._bindings.on('valueWrite', this.onValueWrite.bind(this));
    this._bindings.on('handleRead', this.onHandleRead.bind(this));
    this._bindings.on('handleWrite', this.onHandleWrite.bind(this));
    this._bindings.on('handleNotify', this.onHandleNotify.bind(this));
    this._bindings.on('onMtu', this.onMtu.bind(this));

    this.on('warning', (message) => {
      if (this.listeners('warning').length === 1) {
        console.warn(`noble: ${message}`);
      }
    });

    // lazy init bindings on first new listener, should be on stateChange
    this.on('newListener', (event) => {
      if (event === 'stateChange' && !this.initialized) {
        this.initialized = true;

        process.nextTick(() => {
          this._bindings.init();
        });
      }
    });

    // or lazy init bindings if someone attempts to get state first
    Object.defineProperties(this, {
      state: {
        get: function () {
          if (!this.initialized) {
            this.initialized = true;

            this._bindings.init();
          }
          return this._state;
        }
      }
    });
  }

  setLogger(logFn){
    this._bindings._logger = logFn
  }

  emit(eventName, ...args) {
    debug(`event ${eventName}`)
    return super.emit(eventName, ...args)
  }

  onStateChange(state) {
    debug(`stateChange ${state}`);

    this._state = state;

    this.emit('stateChange', state);
  }

  onAddressChange(address) {
    debug(`addressChange ${address}`);

    this.address = address;
  }

  setScanParameters(interval, window, callback) {
    if (callback) {
      this.once('scanParametersSet', callback);
    }
    this._bindings.setScanParameters(interval, window);
  }

  onScanParametersSet() {
    debug('scanParametersSet');
    this.emit('scanParametersSet');
  }

  startScanning(serviceUuids, allowDuplicates, callback) {
    if (typeof serviceUuids === 'function') {
      this.emit('warning', 'calling startScanning(callback) is deprecated');
    }

    if (typeof allowDuplicates === 'function') {
      this.emit('warning', 'calling startScanning(serviceUuids, callback) is deprecated');
    }

    const scan = (state) => {
      if (state !== 'poweredOn') {
        const error = new Error(`Could not start scanning, state is ${state} (not poweredOn)`);

        if (typeof callback === 'function') {
          callback(error);
        } else {
          throw error;
        }
      } else {
        if (callback) {
          this.once('scanStart', filterDuplicates => {
            callback(null, filterDuplicates);
          });
        }

        this._discoveredPeripheralUUids = [];
        this._allowDuplicates = allowDuplicates;

        this._bindings.startScanning(serviceUuids, allowDuplicates);
      }
    };

    // if bindings still not init, do it now
    if (!this.initialized) {
      this.initialized = true;

      this._bindings.init();

      this.once('stateChange', scan.bind(this));
    } else {
      scan.call(this, this._state);
    }
  }

  startScanningAsync(serviceUUIDs, allowDuplicates) {
    return util.promisify((callback) => this.startScanning(serviceUUIDs, allowDuplicates, callback))();
  }

  stopScanning(callback) {
    if (callback) {
      this.once('scanStop', callback);
    }
    if (this._bindings && this.initialized) {
      this._bindings.stopScanning();
    }
  }

  stopScanningAsync() {
    return util.promisify((callback) => this.stopScanning(callback))();
  }

  onScanStart(filterDuplicates) {
    debug('scanStart');
    this.emit('scanStart', filterDuplicates);
  }

  onScanStop() {
    debug('scanStop');
    this.emit('scanStop');
  }

  reset() {
    this._bindings.reset();
  }

  onDiscover(uuid, address, addressType, connectable, advertisement, rssi) {
    let peripheral = this.peripherals.find(uuid);

    if (!peripheral) {
      peripheral = new Peripheral(this, uuid, address, addressType, connectable, advertisement, rssi);

      this.peripherals.add(peripheral)
    } else {
      // "or" the advertisment data with existing
      for (const i in advertisement) {
        if (advertisement[i] !== undefined) {
          peripheral.advertisement[i] = advertisement[i];
        }
      }

      peripheral.connectable = connectable;
      peripheral.rssi = rssi;
      peripheral.lastSeen = Date.now()/1000
    }

    const previouslyDiscoverd = (this._discoveredPeripheralUUids.indexOf(uuid) !== -1);

    if (!previouslyDiscoverd) {
      this._discoveredPeripheralUUids.push(uuid);
    }

    if (this._allowDuplicates || !previouslyDiscoverd) {
      this.emit('discover', peripheral, advertisement);
    }
  }

  connect(peripheralUuid, parameters) {
    this._bindings.connect(peripheralUuid, parameters);
  }

  getPeripheral(peripheralUuid){
    return this.peripherals.find(peripheralUuid);
  }

  _getPeripheral(peripheralUuid){
    const peripheral = this.peripherals.find(peripheralUuid);
    if(!peripheral) throw new Error(`Unknown peripheral ${peripheralUuid}`)
    return peripheral
  }

  getService(peripheralUuid, serviceUuid) {
    const peripheral = this._getPeripheral(peripheralUuid)
    const service = peripheral.getService(serviceUuid)
    if(!service) throw new Error(`cant find service ${serviceUuid}`)
    return service
  }

  getCharacteristic(peripheralUuid, serviceUuid, characteristicUuid){
    const service = this.getService(peripheralUuid, serviceUuid)
    const c = service.getCharacteristic(characteristicUuid)
    if(!c) throw new Error(`cant find characteristic ${serviceUuid}`)
    return c
  }

  getDescriptor(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid){
    const c = this.getCharacteristic(peripheralUuid, serviceUuid, characteristicUuid)
    const d = c.getDescriptor(descriptorUuid)
    return d
  }

  onConnect(peripheralUuid, error) {
    const peripheral = this._getPeripheral(peripheralUuid)

    peripheral.state = error ? 'error' : 'connected';
    peripheral.emit('connect', error);
  }

  cancelConnect(peripheralUuid, parameters) {
    this._bindings.cancelConnect(peripheralUuid, parameters);
  }

  disconnect(peripheralUuid) {
    this._bindings.disconnect(peripheralUuid);
  }

  onDisconnect(peripheralUuid) {
    const peripheral = this.getPeripheral(peripheralUuid)
    if(peripheral){
      peripheral.state = 'disconnected';
      peripheral.emit('disconnect');
    }
  }

  updateRssi(peripheralUuid) {
    this._bindings.updateRssi(peripheralUuid);
  }

  onRssiUpdate(peripheralUuid, rssi) {
    const peripheral = this._getPeripheral(peripheralUuid)

    peripheral.rssi = rssi;
    peripheral.emit('rssiUpdate', rssi);
  }

  /// add an array of service objects (as retrieved via the servicesDiscovered event)
  addServices(peripheralUuid, services) {
    const servObjs = [];

    for (let i = 0; i < services.length; i++) {
      const o = this.addService(peripheralUuid, services[i]);
      servObjs.push(o);
    }
    return servObjs;
  }

  /// service is a ServiceObject { uuid, startHandle, endHandle,..}
  addService(peripheralUuid, service) {
    const peripheral = this._getPeripheral(peripheralUuid)

    peripheral.addService(service)
  }

  discoverServices(peripheralUuid, uuids) {
    this._bindings.discoverServices(peripheralUuid, uuids);
  }

  onServicesDiscover(peripheralUuid, serviceUuids) {
    const peripheral = this._getPeripheral(peripheralUuid)
    return peripheral.onServicesDiscover(serviceUuids)
  }

  discoverIncludedServices(peripheralUuid, serviceUuid, serviceUuids) {
    this._bindings.discoverIncludedServices(peripheralUuid, serviceUuid, serviceUuids);
  }

  onIncludedServicesDiscover(peripheralUuid, serviceUuid, includedServiceUuids) {
    const peripheral = this._getPeripheral(peripheralUuid)
    return peripheral.onIncludedServicesDiscover(serviceUuid, includedServiceUuids)
  }

  /// add characteristics to the peripheral; returns an array of initialized Characteristics objects
  addCharacteristics(peripheralUuid, serviceUuid, characteristics) {
    // first, initialize gatt layer:
    if (this._bindings.addCharacteristics) {
      this._bindings.addCharacteristics(peripheralUuid, serviceUuid, characteristics);
    }

    const peripheral = this._getPeripheral(peripheralUuid)
    return peripheral.addCharacteristics(serviceUuid, characteristics)
  }

  discoverCharacteristics(peripheralUuid, serviceUuid, characteristicUuids) {
    this._bindings.discoverCharacteristics(peripheralUuid, serviceUuid, characteristicUuids);
  }

  onCharacteristicsDiscover(peripheralUuid, serviceUuid, characteristics) {
    const peripheral = this._getPeripheral(peripheralUuid)
    return peripheral.onCharacteristicsDiscover(serviceUuid, characteristics)
  }

  read(peripheralUuid, serviceUuid, characteristicUuid) {
    this._bindings.read(peripheralUuid, serviceUuid, characteristicUuid);
  }

  onRead(peripheralUuid, serviceUuid, characteristicUuid, data, isNotification) {
    const peripheral = this._getPeripheral(peripheralUuid)
    return peripheral.onRead(serviceUuid, characteristicUuid, data, isNotification)
  }

  write(peripheralUuid, serviceUuid, characteristicUuid, data, withoutResponse) {
    this._bindings.write(peripheralUuid, serviceUuid, characteristicUuid, data, withoutResponse);
  }

  onWrite(peripheralUuid, serviceUuid, characteristicUuid) {
    const peripheral = this._getPeripheral(peripheralUuid)
    return peripheral.onWrite(serviceUuid, characteristicUuid)
  }

  broadcast(peripheralUuid, serviceUuid, characteristicUuid, broadcast) {
    this._bindings.broadcast(peripheralUuid, serviceUuid, characteristicUuid, broadcast);
  }

  onBroadcast(peripheralUuid, serviceUuid, characteristicUuid, state) {
    const peripheral = this._getPeripheral(peripheralUuid)
    return peripheral.onBroadcast(serviceUuid, characteristicUuid, state)
  }

  notify(peripheralUuid, serviceUuid, characteristicUuid, notify) {
    this._bindings.notify(peripheralUuid, serviceUuid, characteristicUuid, notify);
  }

  onNotify(peripheralUuid, serviceUuid, characteristicUuid, state, success) {
    const peripheral = this._getPeripheral(peripheralUuid)
    return peripheral.onNotify(serviceUuid, characteristicUuid, state, success)
  }

  discoverDescriptors(peripheralUuid, serviceUuid, characteristicUuid) {
    this._bindings.discoverDescriptors(peripheralUuid, serviceUuid, characteristicUuid);
  }

  onDescriptorsDiscover(peripheralUuid, serviceUuid, characteristicUuid, descriptors) {
    const peripheral = this._getPeripheral(peripheralUuid)
    return peripheral.onDescriptorsDiscover(serviceUuid, characteristicUuid, descriptors)
  }

  readValue(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid) {
    this._bindings.readValue(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid);
  }

  onValueRead(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid, data) {
    const peripheral = this._getPeripheral(peripheralUuid)
    return peripheral.onValueRead(serviceUuid, characteristicUuid, descriptorUuid, data)
  }

  writeValue(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid, data) {
    this._bindings.writeValue(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid, data);
  }

  onValueWrite(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid) {
    const peripheral = this._getPeripheral(peripheralUuid)
    return peripheral.onValueWrite(serviceUuid, characteristicUuid, descriptorUuid)
  }

  readHandle(peripheralUuid, handle) {
    this._bindings.readHandle(peripheralUuid, handle);
  }

  onHandleRead(peripheralUuid, handle, data) {
    const peripheral = this._getPeripheral(peripheralUuid)
    return peripheral.onHandleRead(handle, data)
  }

  writeHandle(peripheralUuid, handle, data, withoutResponse) {
    this._bindings.writeHandle(peripheralUuid, handle, data, withoutResponse);
  }

  onHandleWrite(peripheralUuid, handle) {
    const peripheral = this._getPeripheral(peripheralUuid)
    return peripheral.onHandleWrite(handle)
  }

  onHandleNotify(peripheralUuid, handle, data) {
    const peripheral = this._getPeripheral(peripheralUuid)
    return peripheral.onHandleNotify(handle, data)
  }

  onMtu(peripheralUuid, mtu) {
    const peripheral = this._getPeripheral(peripheralUuid)
    if (peripheral.mtu && mtu) peripheral.mtu = mtu;
  }
}

module.exports = Noble;