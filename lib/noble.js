const debug = require('debug')('noble');

const events = require('events');
const util = require('util');

const Peripheral = require('./peripheral');
const Service = require('./service');
const Characteristic = require('./characteristic');
const Descriptor = require('./descriptor');
class Noble extends events.EventEmitter {
  constructor(bindings) {
    super()
    this.initialized = false;

    this.address = 'unknown';
    this._state = 'unknown';
    this._bindings = bindings;
    this._peripherals = {};
    this._services = {};
    this._characteristics = {};
    this._descriptors = {};
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
    this._bindings.on('servicesDiscovered', this.onServicesDiscovered.bind(this));
    this._bindings.on('includedServicesDiscover', this.onIncludedServicesDiscover.bind(this));
    this._bindings.on('characteristicsDiscover', this.onCharacteristicsDiscover.bind(this));
    this._bindings.on('characteristicsDiscovered', this.onCharacteristicsDiscovered.bind(this));
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
    let peripheral = this._peripherals[uuid];

    if (!peripheral) {
      peripheral = new Peripheral(this, uuid, address, addressType, connectable, advertisement, rssi);

      this._peripherals[uuid] = peripheral;
      this._services[uuid] = {};
      this._characteristics[uuid] = {};
      this._descriptors[uuid] = {};
    } else {
      // "or" the advertisment data with existing
      for (const i in advertisement) {
        if (advertisement[i] !== undefined) {
          peripheral.advertisement[i] = advertisement[i];
        }
      }

      peripheral.connectable = connectable;
      peripheral.rssi = rssi;
    }

    const previouslyDiscoverd = (this._discoveredPeripheralUUids.indexOf(uuid) !== -1);

    if (!previouslyDiscoverd) {
      this._discoveredPeripheralUUids.push(uuid);
    }

    if (this._allowDuplicates || !previouslyDiscoverd) {
      this.emit('discover', peripheral);
    }
  }

  connect(peripheralUuid, parameters) {
    this._bindings.connect(peripheralUuid, parameters);
  }

  onConnect(peripheralUuid, error) {
    const peripheral = this._peripherals[peripheralUuid];

    if (peripheral) {
      peripheral.state = error ? 'error' : 'connected';
      peripheral.emit('connect', error);
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid} connected!`);
    }
  }

  cancelConnect(peripheralUuid, parameters) {
    this._bindings.cancelConnect(peripheralUuid, parameters);
  }

  disconnect(peripheralUuid) {
    this._bindings.disconnect(peripheralUuid);
  }

  onDisconnect(peripheralUuid) {
    const peripheral = this._peripherals[peripheralUuid];

    if (peripheral) {
      peripheral.state = 'disconnected';
      peripheral.emit('disconnect');
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid} disconnected!`);
    }
  }

  updateRssi(peripheralUuid) {
    this._bindings.updateRssi(peripheralUuid);
  }

  onRssiUpdate(peripheralUuid, rssi) {
    const peripheral = this._peripherals[peripheralUuid];

    if (peripheral) {
      peripheral.rssi = rssi;

      peripheral.emit('rssiUpdate', rssi);
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid} RSSI update!`);
    }
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
    const peripheral = this._peripherals[peripheralUuid];

    // pass on to lower layers (gatt)
    if (this._bindings.addService) {
      this._bindings.addService(peripheralUuid, service);
    }

    if (!peripheral.services) {
      peripheral.services = [];
    }
    // allocate internal service object and return
    const serv = new Service(this, peripheralUuid, service.uuid);

    this._services[peripheralUuid][service.uuid] = serv;
    this._characteristics[peripheralUuid][service.uuid] = {};
    this._descriptors[peripheralUuid][service.uuid] = {};

    peripheral.services.push(serv);

    return serv;
  }

  /// callback receiving a list of service objects from the gatt layer
  onServicesDiscovered(peripheralUuid, services) {
    const peripheral = this._peripherals[peripheralUuid];

    if (peripheral) { peripheral.emit('servicesDiscovered', peripheral, services); } // pass on to higher layers
  }

  discoverServices(peripheralUuid, uuids) {
    this._bindings.discoverServices(peripheralUuid, uuids);
  }

  onServicesDiscover(peripheralUuid, serviceUuids) {
    const peripheral = this._peripherals[peripheralUuid];

    if (peripheral) {
      const services = [];

      for (let i = 0; i < serviceUuids.length; i++) {
        const serviceUuid = serviceUuids[i];
        const service = new Service(this, peripheralUuid, serviceUuid);

        this._services[peripheralUuid][serviceUuid] = service;
        this._characteristics[peripheralUuid][serviceUuid] = {};
        this._descriptors[peripheralUuid][serviceUuid] = {};

        services.push(service);
      }

      peripheral.services = services;

      peripheral.emit('servicesDiscover', services);
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid} services discover!`);
    }
  }

  discoverIncludedServices(peripheralUuid, serviceUuid, serviceUuids) {
    this._bindings.discoverIncludedServices(peripheralUuid, serviceUuid, serviceUuids);
  }

  onIncludedServicesDiscover(peripheralUuid, serviceUuid, includedServiceUuids) {
    const service = this._services[peripheralUuid][serviceUuid];

    if (service) {
      service.includedServiceUuids = includedServiceUuids;

      service.emit('includedServicesDiscover', includedServiceUuids);
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid}, ${serviceUuid} included services discover!`);
    }
  }

  /// add characteristics to the peripheral; returns an array of initialized Characteristics objects
  addCharacteristics(peripheralUuid, serviceUuid, characteristics) {
    // first, initialize gatt layer:
    if (this._bindings.addCharacteristics) {
      this._bindings.addCharacteristics(peripheralUuid, serviceUuid, characteristics);
    }

    const service = this._services[peripheralUuid][serviceUuid];
    if (!service) {
      this.emit('warning', `unknown service ${peripheralUuid}, ${serviceUuid} characteristics discover!`);
      return;
    }

    const characteristics_ = [];
    for (let i = 0; i < characteristics.length; i++) {
      const characteristicUuid = characteristics[i].uuid;

      const characteristic = new Characteristic(
        this,
        peripheralUuid,
        serviceUuid,
        characteristicUuid,
        characteristics[i].properties
      );

      this._characteristics[peripheralUuid][serviceUuid][characteristicUuid] = characteristic;
      this._descriptors[peripheralUuid][serviceUuid][characteristicUuid] = {};

      characteristics_.push(characteristic);
    }
    service.characteristics = characteristics_;
    return characteristics_;
  }

  onCharacteristicsDiscovered(peripheralUuid, serviceUuid, characteristics) {
    const service = this._services[peripheralUuid][serviceUuid];

    service.emit('characteristicsDiscovered', characteristics);
  }

  discoverCharacteristics(peripheralUuid, serviceUuid, characteristicUuids) {
    this._bindings.discoverCharacteristics(peripheralUuid, serviceUuid, characteristicUuids);
  }

  onCharacteristicsDiscover(peripheralUuid, serviceUuid, characteristics) {
    const service = this._services[peripheralUuid][serviceUuid];

    if (service) {
      const characteristics_ = [];

      for (let i = 0; i < characteristics.length; i++) {
        const characteristicUuid = characteristics[i].uuid;

        const characteristic = new Characteristic(
          this,
          peripheralUuid,
          serviceUuid,
          characteristicUuid,
          characteristics[i].properties
        );

        this._characteristics[peripheralUuid][serviceUuid][characteristicUuid] = characteristic;
        this._descriptors[peripheralUuid][serviceUuid][characteristicUuid] = {};

        characteristics_.push(characteristic);
      }

      service.characteristics = characteristics_;

      service.emit('characteristicsDiscover', characteristics_);
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid}, ${serviceUuid} characteristics discover!`);
    }
  }

  read(peripheralUuid, serviceUuid, characteristicUuid) {
    this._bindings.read(peripheralUuid, serviceUuid, characteristicUuid);
  }

  onRead(peripheralUuid, serviceUuid, characteristicUuid, data, isNotification) {
    const characteristic = this._characteristics[peripheralUuid][serviceUuid][characteristicUuid];

    if (characteristic) {
      characteristic.emit('data', data, isNotification);

      characteristic.emit('read', data, isNotification); // for backwards compatbility
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid}, ${serviceUuid}, ${characteristicUuid} read!`);
    }
  }

  write(peripheralUuid, serviceUuid, characteristicUuid, data, withoutResponse) {
    this._bindings.write(peripheralUuid, serviceUuid, characteristicUuid, data, withoutResponse);
  }

  onWrite(peripheralUuid, serviceUuid, characteristicUuid) {
    const characteristic = this._characteristics[peripheralUuid][serviceUuid][characteristicUuid];

    if (characteristic) {
      characteristic.emit('write');
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid}, ${serviceUuid}, ${characteristicUuid} write!`);
    }
  }

  broadcast(peripheralUuid, serviceUuid, characteristicUuid, broadcast) {
    this._bindings.broadcast(peripheralUuid, serviceUuid, characteristicUuid, broadcast);
  }

  onBroadcast(peripheralUuid, serviceUuid, characteristicUuid, state) {
    const characteristic = this._characteristics[peripheralUuid][serviceUuid][characteristicUuid];

    if (characteristic) {
      characteristic.emit('broadcast', state);
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid}, ${serviceUuid}, ${characteristicUuid} broadcast!`);
    }
  }

  notify(peripheralUuid, serviceUuid, characteristicUuid, notify) {
    this._bindings.notify(peripheralUuid, serviceUuid, characteristicUuid, notify);
  }

  onNotify(peripheralUuid, serviceUuid, characteristicUuid, state) {
    const characteristic = this._characteristics[peripheralUuid][serviceUuid][characteristicUuid];

    if (characteristic) {
      characteristic.emit('notify', state);
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid}, ${serviceUuid}, ${characteristicUuid} notify!`);
    }
  }

  discoverDescriptors(peripheralUuid, serviceUuid, characteristicUuid) {
    this._bindings.discoverDescriptors(peripheralUuid, serviceUuid, characteristicUuid);
  }

  onDescriptorsDiscover(peripheralUuid, serviceUuid, characteristicUuid, descriptors) {
    const characteristic = this._characteristics[peripheralUuid][serviceUuid][characteristicUuid];

    if (characteristic) {
      const descriptors_ = [];

      for (let i = 0; i < descriptors.length; i++) {
        const descriptorUuid = descriptors[i];

        const descriptor = new Descriptor(
          this,
          peripheralUuid,
          serviceUuid,
          characteristicUuid,
          descriptorUuid
        );

        this._descriptors[peripheralUuid][serviceUuid][characteristicUuid][descriptorUuid] = descriptor;

        descriptors_.push(descriptor);
      }

      characteristic.descriptors = descriptors_;

      characteristic.emit('descriptorsDiscover', descriptors_);
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid}, ${serviceUuid}, ${characteristicUuid} descriptors discover!`);
    }
  }

  readValue(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid) {
    this._bindings.readValue(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid);
  }

  onValueRead(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid, data) {
    const descriptor = this._descriptors[peripheralUuid][serviceUuid][characteristicUuid][descriptorUuid];

    if (descriptor) {
      descriptor.emit('valueRead', data);
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid}, ${serviceUuid}, ${characteristicUuid}, ${descriptorUuid} value read!`);
    }
  }

  writeValue(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid, data) {
    this._bindings.writeValue(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid, data);
  }

  onValueWrite(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid) {
    const descriptor = this._descriptors[peripheralUuid][serviceUuid][characteristicUuid][descriptorUuid];

    if (descriptor) {
      descriptor.emit('valueWrite');
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid}, ${serviceUuid}, ${characteristicUuid}, ${descriptorUuid} value write!`);
    }
  }

  readHandle(peripheralUuid, handle) {
    this._bindings.readHandle(peripheralUuid, handle);
  }

  onHandleRead(peripheralUuid, handle, data) {
    const peripheral = this._peripherals[peripheralUuid];

    if (peripheral) {
      peripheral.emit(`handleRead${handle}`, data);
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid} handle read!`);
    }
  }

  writeHandle(peripheralUuid, handle, data, withoutResponse) {
    this._bindings.writeHandle(peripheralUuid, handle, data, withoutResponse);
  }

  onHandleWrite(peripheralUuid, handle) {
    const peripheral = this._peripherals[peripheralUuid];

    if (peripheral) {
      peripheral.emit(`handleWrite${handle}`);
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid} handle write!`);
    }
  }

  onHandleNotify(peripheralUuid, handle, data) {
    const peripheral = this._peripherals[peripheralUuid];

    if (peripheral) {
      peripheral.emit('handleNotify', handle, data);
    } else {
      this.emit('warning', `unknown peripheral ${peripheralUuid} handle notify!`);
    }
  }

  onMtu(peripheralUuid, mtu) {
    const peripheral = this._peripherals[peripheralUuid];
    if (peripheral && peripheral.mtu && mtu) peripheral.mtu = mtu;
  }
}

module.exports = Noble;