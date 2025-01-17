const events = require('events');
const util = require('util');

const AclStream = require('./acl-stream');
const Gatt = require('./gatt');
const Gap = require('./gap');
const Hci = require('./hci');
const Signaling = require('./signaling');
const Smp = require('./smp');
const HandleMap = require('./HandleMap')

const NobleBindings = function (options) {
  this._state = null;

  this._pendingConnection = null;
  this._connectionQueue = [];

  this._handles = new HandleMap()
  
  this._gatts = {};
  this._aclStreams = {};
  this._signalings = {};

  this._hci = new Hci(options);
  this._gap = new Gap(this._hci);

  this._logger = console.warn
};

util.inherits(NobleBindings, events.EventEmitter);

NobleBindings.prototype.setScanParameters = function (interval, window) {
  this._gap.setScanParameters(interval, window);
};

NobleBindings.prototype.startScanning = function (serviceUuids, allowDuplicates, active = true) {
  this._scanServiceUuids = serviceUuids || [];

  this._gap.startScanning(allowDuplicates, active);
};

NobleBindings.prototype.stopScanning = function () {
  this._gap.stopScanning();
};

NobleBindings.prototype.connect = function (peripheralUuid, addressType, parameters) {
  const row = { peripheralUuid, addressType, parameters }
  if (!this._pendingConnection) {
    this.stopScanning()
    
    this._pendingConnection = row;

    this._hci.createLeConn(peripheralUuid, addressType, parameters);
  } else {
    this._connectionQueue.push(row);
  }
};

NobleBindings.prototype.processPendingQueue = function(){
  if(!this._pendingConnection){
    return
  }
  if (this._connectionQueue.length > 0) {
    const queueItem = this._connectionQueue.shift();
    const peripheralUuid = queueItem.peripheralUuid;

    console.log("starting connecting to "+peripheralUuid+" from queue")
    this._pendingConnection = queueItem;

    this._hci.createLeConn(peripheralUuid, queueItem.addressType, queueItem.parameters);
  } else {
    console.log("no more connections to make")
    this._pendingConnection = null;
  }
}

NobleBindings.prototype.disconnect = function (peripheralUuid) {
  this._hci.disconnect(this._handles.getHandle(peripheralUuid));
};

NobleBindings.prototype.cancelConnect = function (peripheralUuid) {
  if(!this._pendingConnection){
    throw new Error(`Requested cancellation of ${peripheralUuid} but was not connecting`)
  }
  if(peripheralUuid != this._pendingConnection.peripheralUuid){
    throw new Error(`Requested cancellation of ${peripheralUuid} but was not pending`)
  }
  this._hci.cancelConnect();
  this.processPendingQueue()
};

NobleBindings.prototype.reset = function () {
  this._hci.reset();
};

NobleBindings.prototype.updateRssi = function (peripheralUuid) {
  this._hci.readRssi(this._handles.getHandle(peripheralUuid));
};

NobleBindings.prototype.init = function () {
  this.onSigIntBinded = this.onSigInt.bind(this);

  this._gap.on('scanParametersSet', this.onScanParametersSet.bind(this));
  this._gap.on('scanStart', this.onScanStart.bind(this));
  this._gap.on('scanStop', this.onScanStop.bind(this));
  this._gap.on('discover', this.onDiscover.bind(this));

  this._hci.on('stateChange', this.onStateChange.bind(this));
  this._hci.on('addressChange', this.onAddressChange.bind(this));
  this._hci.on('leConnComplete', this.onLeConnComplete.bind(this));
  this._hci.on('leConnUpdateComplete', this.onLeConnUpdateComplete.bind(this));
  this._hci.on('rssiRead', this.onRssiRead.bind(this));
  this._hci.on('disconnComplete', this.onDisconnComplete.bind(this));
  this._hci.on('encryptChange', this.onEncryptChange.bind(this));
  this._hci.on('aclDataPkt', this.onAclDataPkt.bind(this));

  this._hci.init();

  /* Add exit handlers after `init()` has completed. If no adaptor
  is present it can throw an exception - in which case we don't
  want to try and clear up afterwards (issue #502) */
  process.on('SIGINT', this.onSigIntBinded);
  process.on('exit', this.onExit.bind(this));
};

NobleBindings.prototype.onSigInt = function () {
  const sigIntListeners = process.listeners('SIGINT');

  if (sigIntListeners[sigIntListeners.length - 1] === this.onSigIntBinded) {
    // we are the last listener, so exit
    // this will trigger onExit, and clean up
    process.exit(1);
  }
};

NobleBindings.prototype.onExit = function () {
  this.stopScanning();

  for (const handle in this._aclStreams) {
    this._hci.disconnect(handle);
  }
};

NobleBindings.prototype.onStateChange = function (state) {
  if (this._state === state) {
    return;
  }
  this._state = state;

  if (state === 'unauthorized') {
    console.log('noble warning: adapter state unauthorized, please run as root or with sudo');
    console.log('               or see README for information on running without root/sudo:');
    console.log('               https://github.com/sandeepmistry/noble#running-on-linux');
  } else if (state === 'unsupported') {
    console.log('noble warning: adapter does not support Bluetooth Low Energy (BLE, Bluetooth Smart).');
    console.log('               Try to run with environment variable:');
    console.log('               [sudo] NOBLE_HCI_DEVICE_ID=x node ...');
  }

  this.emit('stateChange', state);
};

NobleBindings.prototype.onAddressChange = function (address) {
  this.emit('addressChange', address);
};

NobleBindings.prototype.onScanParametersSet = function () {
  this.emit('scanParametersSet');
};

NobleBindings.prototype.onScanStart = function (filterDuplicates) {
  this.emit('scanStart', filterDuplicates);
};

NobleBindings.prototype.onScanStop = function () {
  this.emit('scanStop');
};

NobleBindings.prototype.onDiscover = function (status, address, addressType, connectable, advertisement, rssi) {
  if (this._scanServiceUuids === undefined) {
    return;
  }

  let serviceUuids = advertisement.serviceUuids || [];
  const serviceData = advertisement.serviceData || [];
  let hasScanServiceUuids = (this._scanServiceUuids.length === 0);

  if (!hasScanServiceUuids) {
    let i;

    serviceUuids = serviceUuids.slice();

    for (i in serviceData) {
      serviceUuids.push(serviceData[i].uuid);
    }

    for (i in serviceUuids) {
      hasScanServiceUuids = (this._scanServiceUuids.indexOf(serviceUuids[i]) !== -1);

      if (hasScanServiceUuids) {
        break;
      }
    }
  }

  if (hasScanServiceUuids) {
    const uuid = address.split(':').join('');
    this.emit('discover', uuid, address, addressType, connectable, advertisement, rssi);
  }
};

NobleBindings.prototype.onLeConnComplete = function (status, handle, role, addressType, address, interval, latency, supervisionTimeout, masterClockAccuracy) {
  console.log(this, role)
  if (role !== undefined && role !== 0) {
    if(status == 2){
      // we probably cancelled this connection, no logging required
      return
    }
    this._logger('role not master ignore connection result with status ' + status + ' and handle ' + handle);
    if(handle) this._hci.disconnect(handle)
    return;
  }

  let uuid = null;
  if(!address) {
    if(!this._pendingConnection) {
      this._logger('connection complete with no address and no pending connection')
      if(handle) this._hci.disconnect(handle)
      return
    }
    uuid = this._pendingConnection.peripheralUuid;
  }
  else uuid = address.split(':').join('').toLowerCase();

  try {

    if(addressType === undefined){
      if(!this._pendingConnection) {
        this._logger('connection complete with no address type and no pending connection')
        if(handle) this._hci.disconnect(handle)
        return
      }
      addressType = this._pendingConnection.addressType;
    }
    console.log('onLeConnComplete', {uuid, addressType, status, handle})

    let error = null;

    if (status === 0) {
      
      let existingHandle = this._handles.getHandle(uuid)
      if(existingHandle){
        this.onDisconnComplete(existingHandle, null)
      }

      const smp = new Smp(this._hci.addressType, this._hci.address, addressType, uuid)
      const aclStream = new AclStream(this._hci, handle, smp);
      smp.attachAclStream(aclStream)
      smp.handleLegacyPasskeyPairing = this.handleLegacyPasskeyPairing

      const gatt = new Gatt(uuid, aclStream, this._noble);
      const signaling = new Signaling(handle, aclStream);

      this._gatts[uuid] = this._gatts[handle] = gatt;
      this._signalings[uuid] = this._signalings[handle] = signaling;
      this._aclStreams[handle] = aclStream;
      this._handles.addHandle(handle, uuid);

      this._gatts[handle].on('mtu', this.onMtu.bind(this));
      this._gatts[handle].on('servicesDiscover', this.onServicesDiscover.bind(this));
      this._gatts[handle].on('includedServicesDiscover', this.onIncludedServicesDiscovered.bind(this));
      this._gatts[handle].on('characteristicsDiscover', this.onCharacteristicsDiscovered.bind(this));
      this._gatts[handle].on('characteristicsDiscovered', this.onCharacteristicsDiscoveredEX.bind(this));
      this._gatts[handle].on('read', this.onRead.bind(this));
      this._gatts[handle].on('write', this.onWrite.bind(this));
      this._gatts[handle].on('broadcast', this.onBroadcast.bind(this));
      this._gatts[handle].on('notify', this.onNotify.bind(this));
      this._gatts[handle].on('notification', this.onNotification.bind(this));
      this._gatts[handle].on('descriptorsDiscover', this.onDescriptorsDiscovered.bind(this));
      this._gatts[handle].on('valueRead', this.onValueRead.bind(this));
      this._gatts[handle].on('valueWrite', this.onValueWrite.bind(this));
      this._gatts[handle].on('handleRead', this.onHandleRead.bind(this));
      this._gatts[handle].on('handleWrite', this.onHandleWrite.bind(this));
      this._gatts[handle].on('handleNotify', this.onHandleNotify.bind(this));

      this._signalings[handle].on('connectionParameterUpdateRequest', this.onConnectionParameterUpdateRequest.bind(this));

      this._gatts[handle].exchangeMtu(256);
    } else {
      if(status == 0xc){
        this._logger('this event usually requires a chip reset (handle ' + handle + ')')
        this._hci.cancelConnect()
        this._hci.reset()
        this._hci._initDev()
      }
      let statusMessage = Hci.STATUS_MAPPER[status] || 'HCI Error: Unknown';
      const errorCode = ` (0x${status.toString(16)})`;
      statusMessage = statusMessage + errorCode;
      error = new Error(statusMessage);
    }

    this.emit('connect', uuid, error);
  } finally {
    this.processPendingQueue()
  }
};

NobleBindings.prototype.onLeConnUpdateComplete = function (handle, interval, latency, supervisionTimeout) {
  // no-op
};

NobleBindings.prototype.onDisconnComplete = function (handle, reason) {
  const uuid = this._handles.getUuid(handle);

  if (uuid) {
    this._aclStreams[handle].push(null, null);
    this._gatts[handle].removeAllListeners();
    this._signalings[handle].removeAllListeners();

    delete this._gatts[uuid];
    delete this._gatts[handle];
    delete this._signalings[uuid];
    delete this._signalings[handle];
    delete this._aclStreams[handle];
    delete this._handles.removeHandle(handle);

    this.emit('disconnect', uuid, reason); // TODO: handle reason?
  } else {
    this._logger(`noble warning: unknown handle ${handle} disconnected!`);
  }
};

NobleBindings.prototype.onEncryptChange = function (handle, encrypt) {
  const aclStream = this._aclStreams[handle];

  if (aclStream) {
    aclStream.pushEncrypt(encrypt);
  }
};

NobleBindings.prototype.encrypt = function (peripheralUuid) {
  const handle = this._handles.getHandle(peripheralUuid)
  if(handle === undefined){
    return false
  }
  const aclStream = this._aclStreams[handle];

  if (aclStream) {
    aclStream.encrypt();
    return true
  }
  return false
};

NobleBindings.prototype.onMtu = function (address, mtu) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('onMtu', uuid, mtu);
};

NobleBindings.prototype.onRssiRead = function (handle, rssi) {
  const uuid = this._handles.getUuid(handle)
  if(!uuid) {
    this._logger(`noble warning: unknown handle ${handle} on RssiRead!`);
    return
  }
  this.emit('rssiUpdate', uuid, rssi);
};

NobleBindings.prototype.onAclDataPkt = function (handle, cid, data) {
  const aclStream = this._aclStreams[handle];

  if (aclStream) {
    aclStream.push(cid, data);
  }
};

NobleBindings.prototype.discoverServices = function (peripheralUuid, uuids) {
  const handle = this._handles.getHandle(peripheralUuid);
  const gatt = this._gatts[handle];

  if (gatt) {
    gatt.discoverServices(uuids || []);
    return true
  } 
  
  this._logger(`noble warning: unknown peripheral ${peripheralUuid} during discoverServices`);
  return false
};

NobleBindings.prototype.onServicesDiscover = function (address, serviceUuids) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('servicesDiscover', uuid, serviceUuids);
};


NobleBindings.prototype.discoverIncludedServices = function (peripheralUuid, serviceUuid, serviceUuids) {
  const handle = this._handles.getHandle(peripheralUuid);
  const gatt = this._gatts[handle];

  if (gatt) {
    gatt.discoverIncludedServices(serviceUuid, serviceUuids || []);
    return true
  } 
  
  this._logger(`noble warning: unknown peripheral ${peripheralUuid} during discoverIncludedServices`);
  return false
};

NobleBindings.prototype.onIncludedServicesDiscovered = function (address, serviceUuid, includedServiceUuids) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('includedServicesDiscover', uuid, serviceUuid, includedServiceUuids);
};

NobleBindings.prototype.addCharacteristics = function (peripheralUuid, serviceUuid, characteristics) {
  const handle = this._handles.getHandle(peripheralUuid);
  const gatt = this._gatts[handle];

  if (gatt) {
    gatt.addCharacteristics(serviceUuid, characteristics);
    return true
  } 
  
  this._logger(`noble warning: unknown peripheral ${peripheralUuid} during addCharacteristics`);
  return false
};

NobleBindings.prototype.discoverCharacteristics = function (peripheralUuid, serviceUuid, characteristicUuids) {
  const handle = this._handles.getHandle(peripheralUuid);
  const gatt = this._gatts[handle];

  if (gatt) {
    gatt.discoverCharacteristics(serviceUuid, characteristicUuids || []);
    return true
  }
  
  this._logger(`noble warning: unknown peripheral ${peripheralUuid} during discoverCharacteristics`);
  return false
};

NobleBindings.prototype.onCharacteristicsDiscovered = function (address, serviceUuid, characteristics) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('characteristicsDiscover', uuid, serviceUuid, characteristics);
};

NobleBindings.prototype.onCharacteristicsDiscoveredEX = function (address, serviceUuid, characteristics) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('characteristicsDiscovered', uuid, serviceUuid, characteristics);
};

NobleBindings.prototype.read = function (peripheralUuid, serviceUuid, characteristicUuid) {
  const handle = this._handles.getHandle(peripheralUuid);
  const gatt = this._gatts[handle];

  if (gatt) {
    gatt.read(serviceUuid, characteristicUuid);
    return true
  }
  
  this._logger(`noble warning: unknown peripheral ${peripheralUuid} during read`);
  return false
};

NobleBindings.prototype.onRead = function (address, serviceUuid, characteristicUuid, data) {
  const uuid = address.split(':').join('').toLowerCase();
  this.emit('read', uuid, serviceUuid, characteristicUuid, data, false);
};

NobleBindings.prototype.write = function (peripheralUuid, serviceUuid, characteristicUuid, data, withoutResponse) {
  const handle = this._handles.getHandle(peripheralUuid);
  const gatt = this._gatts[handle];

  if (gatt) {
    gatt.write(serviceUuid, characteristicUuid, data, withoutResponse);
    return true
  } 
  
  this._logger(`noble warning: unknown peripheral ${peripheralUuid} during write`);
  return false
};

NobleBindings.prototype.onWrite = function (address, serviceUuid, characteristicUuid) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('write', uuid, serviceUuid, characteristicUuid);
};

NobleBindings.prototype.broadcast = function (peripheralUuid, serviceUuid, characteristicUuid, broadcast) {
  const handle = this._handles.getHandle(peripheralUuid);
  const gatt = this._gatts[handle];

  if (gatt) {
    gatt.broadcast(serviceUuid, characteristicUuid, broadcast);
    return true
  } 
  
  this._logger(`noble warning: unknown peripheral ${peripheralUuid} during broadcast`);
  return false
};

NobleBindings.prototype.onBroadcast = function (address, serviceUuid, characteristicUuid, state) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('broadcast', uuid, serviceUuid, characteristicUuid, state);
};

NobleBindings.prototype.notify = function (peripheralUuid, serviceUuid, characteristicUuid, notify, options = {}) {
  const handle = this._handles.getHandle(peripheralUuid);
  const gatt = this._gatts[handle];

  if (gatt) {
    gatt.notify(serviceUuid, characteristicUuid, notify, options);
    return true
  } 
  this._logger(`noble warning: unknown peripheral ${peripheralUuid} during notify`);
  return false
};

NobleBindings.prototype.onNotify = function (address, serviceUuid, characteristicUuid, state, error) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('notify', uuid, serviceUuid, characteristicUuid, state, error);
};

NobleBindings.prototype.onNotification = function (address, serviceUuid, characteristicUuid, data) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('read', uuid, serviceUuid, characteristicUuid, data, true);
};

NobleBindings.prototype.discoverDescriptors = function (peripheralUuid, serviceUuid, characteristicUuid) {
  const handle = this._handles.getHandle(peripheralUuid);
  const gatt = this._gatts[handle];

  if (gatt) {
    gatt.discoverDescriptors(serviceUuid, characteristicUuid);
    return true
  } 
  this._logger(`noble warning: unknown peripheral ${peripheralUuid} during discoverDescriptors`);
  return false
};

NobleBindings.prototype.onDescriptorsDiscovered = function (address, serviceUuid, characteristicUuid, descriptorUuids) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('descriptorsDiscover', uuid, serviceUuid, characteristicUuid, descriptorUuids);
};

NobleBindings.prototype.readValue = function (peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid) {
  const handle = this._handles.getHandle(peripheralUuid);
  const gatt = this._gatts[handle];

  if (gatt) {
    gatt.readValue(serviceUuid, characteristicUuid, descriptorUuid);
    return true
  } 
  
  this._logger(`noble warning: unknown peripheral ${peripheralUuid} during readValue`);
  return false
};

NobleBindings.prototype.onValueRead = function (address, serviceUuid, characteristicUuid, descriptorUuid, data) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('valueRead', uuid, serviceUuid, characteristicUuid, descriptorUuid, data);
};

NobleBindings.prototype.writeValue = function (peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid, data) {
  const handle = this._handles.getHandle(peripheralUuid);
  const gatt = this._gatts[handle];

  if (gatt) {
    gatt.writeValue(serviceUuid, characteristicUuid, descriptorUuid, data);
    return true
  } 
  
  this._logger(`noble warning: unknown peripheral ${peripheralUuid} during writeValue`);
  return false
};

NobleBindings.prototype.onValueWrite = function (address, serviceUuid, characteristicUuid, descriptorUuid) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('valueWrite', uuid, serviceUuid, characteristicUuid, descriptorUuid);
};

NobleBindings.prototype.readHandle = function (peripheralUuid, attHandle) {
  const handle = this._handles.getHandle(peripheralUuid);
  const gatt = this._gatts[handle];

  if (gatt) {
    gatt.readHandle(attHandle);
    return true
  }

  this._logger(`noble warning: unknown peripheral ${peripheralUuid} during readHandle`);
  return false
};

NobleBindings.prototype.onHandleRead = function (address, handle, data) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('handleRead', uuid, handle, data);
};

NobleBindings.prototype.writeHandle = function (peripheralUuid, attHandle, data, withoutResponse) {
  const handle = this._handles.getHandle(peripheralUuid);
  const gatt = this._gatts[handle];

  if (gatt) {
    gatt.writeHandle(attHandle, data, withoutResponse);
    return true
  } 

  this._logger(`noble warning: unknown peripheral ${peripheralUuid} during writeHandle`);
  return false
};

NobleBindings.prototype.onHandleWrite = function (address, handle) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('handleWrite', uuid, handle);
};

NobleBindings.prototype.onHandleNotify = function (address, handle, data) {
  const uuid = address.split(':').join('').toLowerCase();

  this.emit('handleNotify', uuid, handle, data);
};

NobleBindings.prototype.onConnectionParameterUpdateRequest = function (handle, minInterval, maxInterval, latency, supervisionTimeout) {
  this._hci.connUpdateLe(handle, minInterval, maxInterval, latency, supervisionTimeout);
};

module.exports = NobleBindings;
