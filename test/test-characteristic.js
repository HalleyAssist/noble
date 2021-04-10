require('should');
const sinon = require('sinon');

const Characteristic = require('../lib/characteristic');

describe('Characteristic', function () {
  let mockNoble = null;
  const mockPeripheralId = 'mock-peripheral-id';
  const mockServiceUuid = 'mock-service-uuid';
  const mockUuid = 'mock-uuid';
  const mockProperties = ['mock-property-1', 'mock-property-2'];

  let characteristic = null;

  beforeEach(function () {
    mockNoble = {
      read: sinon.spy(),
      write: sinon.spy(),
      broadcast: sinon.spy(),
      notify: sinon.spy(),
      discoverDescriptors: sinon.spy()
    };

    characteristic = new Characteristic(mockNoble, mockPeripheralId, mockServiceUuid, mockUuid, mockProperties);
  });

  afterEach(function () {
    characteristic = null;
  });

  it('should have a uuid', function () {
    characteristic.uuid.should.equal(mockUuid);
  });

  it('should lookup name and type by uuid', function () {
    characteristic = new Characteristic(mockNoble, mockPeripheralId, mockServiceUuid, '2a00', mockProperties);

    characteristic.name.should.equal('Device Name');
    characteristic.type.should.equal('org.bluetooth.characteristic.gap.device_name');
  });

  it('should have properties', function () {
    characteristic.properties.should.equal(mockProperties);
  });

  describe('toString', function () {
    it('should be uuid, name, type, properties', function () {
      characteristic.toString().should.equal('{"uuid":"mock-uuid","name":null,"type":null,"properties":["mock-property-1","mock-property-2"]}');
    });
  });

  describe('readAsync', () => {
    it('should delegate to noble', async () => {
      const promise = characteristic.readAsync();
      characteristic.emit('read', true);
      const ret = await promise;

      mockNoble.read.calledWithExactly(mockPeripheralId, mockServiceUuid, mockUuid).should.equal(true);
      ret.should.equal(true)
    });

    it('should resolve with data', async () => {
      const mockData = Buffer.alloc(0);

      const promise = characteristic.readAsync();
      characteristic.emit('read', mockData);
      const result = await promise;

      result.should.equal(mockData);
    });
  });

  describe('writeAsync', () => {
    let mockData = null;

    beforeEach(() => {
      mockData = Buffer.alloc(0);
    });

    it('should only accept data as a buffer', async () => {
      mockData = {};

      await characteristic.writeAsync(mockData).should.be.rejectedWith('data must be a Buffer or Uint8Array or Uint16Array or Uint32Array');
    });

    it('should delegate to noble, withoutResponse false', async () => {
      const promise = characteristic.writeAsync(mockData, false);
      characteristic.emit('write');
      await promise;

      mockNoble.write.calledWithExactly(mockPeripheralId, mockServiceUuid, mockUuid, mockData, false).should.equal(true);
    });

    it('should delegate to noble, withoutResponse true', async () => {
      const promise = characteristic.writeAsync(mockData, true);
      characteristic.emit('write');
      await promise;

      mockNoble.write.calledWithExactly(mockPeripheralId, mockServiceUuid, mockUuid, mockData, true).should.equal(true);
    });

    it('should resolve', async () => {
      const promise = characteristic.writeAsync(mockData, true);
      characteristic.emit('write');
      await promise;

      await promise.should.be.resolved();
    });
  });

  describe('broadcastAsync', () => {
    it('should delegate to noble, true', async () => {
      const promise = characteristic.broadcastAsync(true);
      characteristic.emit('broadcast');
      await promise;

      mockNoble.broadcast.calledWithExactly(mockPeripheralId, mockServiceUuid, mockUuid, true).should.equal(true);
    });

    it('should delegate to noble, false', async () => {
      const promise = characteristic.broadcastAsync(false);
      characteristic.emit('broadcast');
      await promise;

      mockNoble.broadcast.calledWithExactly(mockPeripheralId, mockServiceUuid, mockUuid, false).should.equal(true);
    });

    it('should resolve', async () => {
      const promise = characteristic.broadcastAsync(true);
      characteristic.emit('broadcast');
      await promise;

      await promise.should.be.resolved();
    });
  });

  describe('notifyAsync', () => {
    it('should delegate to noble, true', async () => {
      const promise = characteristic.notifyAsync(true);
      characteristic.emit('notify');
      await promise;

      mockNoble.notify.calledWithExactly(mockPeripheralId, mockServiceUuid, mockUuid, true).should.equal(true);
    });

    it('should delegate to noble, false', async () => {
      const promise = characteristic.notifyAsync(false);
      characteristic.emit('notify');
      await promise;

      mockNoble.notify.calledWithExactly(mockPeripheralId, mockServiceUuid, mockUuid, false).should.equal(true);
    });

    it('should resolve', async () => {
      const promise = characteristic.notifyAsync(true);
      characteristic.emit('notify');
      await promise;

      await promise.should.be.resolved();
    });
  });

  describe('subscribeAsync', () => {
    it('should delegate to noble notify, true', async () => {
      const promise = characteristic.subscribeAsync();
      characteristic.emit('notify');
      await promise;

      mockNoble.notify.calledWithExactly(mockPeripheralId, mockServiceUuid, mockUuid, true).should.equal(true);
    });

    it('should resolve', async () => {
      const promise = characteristic.subscribeAsync();
      characteristic.emit('notify');
      await promise;

      await promise.should.be.resolved();
    });
  });

  describe('unsubscribeAsync', () => {
    it('should delegate to noble notify, false', async () => {
      const promise = characteristic.unsubscribeAsync();
      characteristic.emit('notify');
      await promise;

      mockNoble.notify.calledWithExactly(mockPeripheralId, mockServiceUuid, mockUuid, false).should.equal(true);
    });

    it('should resolve', async () => {
      const promise = characteristic.unsubscribeAsync();
      characteristic.emit('notify');
      await promise;

      await promise.should.be.resolved();
    });
  });

  describe('discoverDescriptorsAsync', () => {
    it('should delegate to noble', async () => {
      const promise = characteristic.discoverDescriptorsAsync();
      characteristic.emit('descriptorsDiscover', true);
      await promise;

      mockNoble.discoverDescriptors.calledWithExactly(mockPeripheralId, mockServiceUuid, mockUuid).should.equal(true);
    });

    it('should resolve with descriptors', async () => {
      const mockDescriptors = [];

      const promise = characteristic.discoverDescriptorsAsync();
      characteristic.emit('descriptorsDiscover', mockDescriptors);
      const result = await promise;

      result.should.equal(mockDescriptors);
    });
  });
});
