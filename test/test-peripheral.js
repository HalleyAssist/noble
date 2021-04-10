require('should');
const sinon = require('sinon');
const { fake, assert } = sinon;

const Peripheral = require('../lib/peripheral');

describe('Peripheral', function () {
  let mockNoble = null;
  const mockId = 'mock-id';
  const mockAddress = 'mock-address';
  const mockAddressType = 'mock-address-type';
  const mockConnectable = 'mock-connectable';
  const mockAdvertisement = 'mock-advertisement';
  const mockRssi = 'mock-rssi';
  const mockHandle = 'mock-handle';
  let mockData = 'mock-data';

  let peripheral = null;

  beforeEach(function () {
    mockNoble = {
      connect: sinon.spy(),
      cancelConnect: fake.returns(null),
      disconnect: sinon.spy(),
      updateRssi: sinon.spy(),
      discoverServices: sinon.spy(),
      readHandle: sinon.spy(),
      writeHandle: sinon.spy()
    };

    peripheral = new Peripheral(mockNoble, mockId, mockAddress, mockAddressType, mockConnectable, mockAdvertisement, mockRssi);
  });

  afterEach(function () {
    peripheral = null;
    sinon.reset();
  });

  it('should have a id', function () {
    peripheral.id.should.equal(mockId);
  });

  it('should have an address', function () {
    peripheral.address.should.equal(mockAddress);
  });

  it('should have an address type', function () {
    peripheral.addressType.should.equal(mockAddressType);
  });

  it('should have connectable', function () {
    peripheral.connectable.should.equal(mockConnectable);
  });

  it('should have advertisement', function () {
    peripheral.advertisement.should.equal(mockAdvertisement);
  });

  it('should have rssi', function () {
    peripheral.rssi.should.equal(mockRssi);
  });

  describe('toString', function () {
    it('should be id, address, address type, connectable, advertisement, rssi, state', function () {
      peripheral.toString().should.equal('{"id":"mock-id","address":"mock-address","addressType":"mock-address-type","connectable":"mock-connectable","advertisement":"mock-advertisement","rssi":"mock-rssi","mtu":null,"state":"disconnected"}');
    });
  });

  describe('connectAsync', () => {
    it('should resolve', async () => {
      const promise = peripheral.connectAsync();

      peripheral.emit('connect');

      await promise.should.be.fulfilled();
    });

    it('should reject on error', async () => {
      const promise = peripheral.connectAsync();

      peripheral.emit('connect', new Error('error'));

      await promise.should.be.rejectedWith('error');
    });

    it('should delegate to noble', async () => {
      const promise = peripheral.connectAsync();

      peripheral.emit('connect');
      await promise;

      mockNoble.connect.calledWithExactly(mockId, undefined).should.equal(true);
    });

    it('with options', async () => {
      const options = { options: true };

      const promise = peripheral.connectAsync(options);
      peripheral.emit('connect');
      await promise;

      mockNoble.connect.calledWithExactly(peripheral.id, options).should.equal(true);
    });
  });

  describe('disconnectAsync', function () {
    it('should resolve', async () => {
      const promise = peripheral.disconnectAsync();

      peripheral.emit('disconnect');

      await promise.should.be.fulfilled();
    });

    it('should delegate to noble',async  () => {
      const promise = peripheral.disconnectAsync();

      peripheral.emit('disconnect');
      await promise.should.be.fulfilled();

      mockNoble.disconnect.calledWithExactly(mockId).should.equal(true);
    });
  });

  describe('updateRssiAsync', () => {
    it('should resolve with rssi', async () => {
      const promise = peripheral.updateRssiAsync();

      peripheral.emit('rssiUpdate', mockRssi);

      await promise.should.be.fulfilledWith(mockRssi);
    });

    it('should delegate to noble', async () => {
      const promise = peripheral.updateRssiAsync();

      peripheral.emit('rssiUpdate', true);
      await promise;

      mockNoble.updateRssi.calledWithExactly(mockId).should.equal(true);
    });
  });

  describe('discoverServicesAsync', () => {
    it('should resolve with services', async () => {
      const mockServices = 'discoveredServices';

      const promise = peripheral.discoverServicesAsync();
      peripheral.emit('servicesDiscover', mockServices);

      await promise.should.be.fulfilledWith(mockServices);
    });

    it('should delegate to noble', async () => {
      const promise = peripheral.discoverServicesAsync();
      peripheral.emit('servicesDiscover', true);
      await promise;

      mockNoble.discoverServices.calledWithExactly(mockId, undefined).should.equal(true);
    });

    it('should delegate to noble, service uuids', async () => {
      const mockServiceUuids = [];

      const promise = peripheral.discoverServicesAsync(mockServiceUuids);
      peripheral.emit('servicesDiscover', true);
      await promise;

      mockNoble.discoverServices.calledWithExactly(mockId, mockServiceUuids).should.equal(true);
    });
  });

  describe('discoverSomeServicesAndCharacteristicsAsync', () => {
    const mockServiceUuids = [];
    const mockCharacteristicUuids = [];
    let mockServices = null;

    beforeEach(function () {
      peripheral.discoverServicesAsync = sinon.spy(peripheral.discoverServicesAsync);

      mockServices = [
        {
          uuid: '1',
          discoverCharacteristicsAsync: sinon.spy()
        },
        {
          uuid: '2',
          discoverCharacteristicsAsync: sinon.spy()
        }
      ];
    });

    it('should call discoverServices', async () => {
      peripheral.discoverSomeServicesAndCharacteristicsAsync(mockServiceUuids);

      peripheral.discoverServicesAsync.calledWith(mockServiceUuids).should.equal(true);
    });

    it('should call discoverCharacteristics on each service discovered', async function() {
      const p = peripheral.discoverSomeServicesAndCharacteristicsAsync(mockServiceUuids, mockCharacteristicUuids);

      peripheral.emit('servicesDiscover', mockServices);
      await p

      mockServices[0].discoverCharacteristicsAsync.calledWith(mockCharacteristicUuids).should.equal(true);
      mockServices[1].discoverCharacteristicsAsync.calledWith(mockCharacteristicUuids).should.equal(true);
    });

    it('should reject on error', async () => {
      const promise = peripheral.discoverSomeServicesAndCharacteristicsAsync(mockServiceUuids);

      peripheral.emit('servicesDiscover', new Error('error'));

      await promise.should.be.rejectedWith('error');
    });
/*
    it('should resolve with the services and characteristics discovered', async () => {
      const promise = peripheral.discoverSomeServicesAndCharacteristicsAsync(mockServiceUuids, mockCharacteristicUuids);


      const mockCharacteristic1 = { uuid: '1' };
      const mockCharacteristic2 = { uuid: '2' };
      const mockCharacteristic3 = { uuid: '3' };

      mockServices[0].discoverCharacteristicsAsync.getCall(0).returns([mockCharacteristic1]);
      mockServices[1].discoverCharacteristicsAsync.getCall(0).args[1](null, [mockCharacteristic2, mockCharacteristic3]);

      peripheral.emit('servicesDiscover', mockServices);

      const result = await promise;

      result.services.should.equal(mockServices);
      result.characteristics.should.eql([mockCharacteristic1, mockCharacteristic2, mockCharacteristic3]);
    });
    */
  });

  describe('discoverAllServicesAndCharacteristicsAsync', () => {
    it('should call discoverSomeServicesAndCharacteristics', async () => {
      peripheral.discoverSomeServicesAndCharacteristicsAsync = sinon.spy();

      const promise = peripheral.discoverAllServicesAndCharacteristicsAsync();

      peripheral.emit('servicesDiscover', true);
      await promise;

      peripheral.discoverSomeServicesAndCharacteristicsAsync.getCall(0).args[0].should.eql([]);
      peripheral.discoverSomeServicesAndCharacteristicsAsync.getCall(0).args[1].should.eql([]);
    });
  });

  describe('readHandle', function () {
    it('should delegate to noble', function () {
      peripheral.readHandle(mockHandle);

      mockNoble.readHandle.calledWithExactly(mockId, mockHandle).should.equal(true);
    });

    it('should callback', function () {
      let calledback = false;

      peripheral.readHandle(mockHandle, function () {
        calledback = true;
      });
      peripheral.emit(`handleRead${mockHandle}`);

      calledback.should.equal(true);
    });

    it('should callback with data', function () {
      let calledbackData = null;

      peripheral.readHandle(mockHandle, function (error, data) {
        if (error) {
          throw new Error(error);
        }
        calledbackData = data;
      });
      peripheral.emit(`handleRead${mockHandle}`, mockData);

      calledbackData.should.equal(mockData);
    });
  });

  describe('readHandleAsync', () => {
    it('should delegate to noble', async () => {
      const promise = peripheral.readHandleAsync(mockHandle);

      peripheral.emit(`handleRead${mockHandle}`);
      await promise;

      mockNoble.readHandle.calledWithExactly(mockId, mockHandle).should.equal(true);
    });

    it('should resolve with data', async () => {
      const promise = peripheral.readHandleAsync(mockHandle);

      peripheral.emit(`handleRead${mockHandle}`, mockData);

      await promise.should.be.fulfilledWith(mockData);
    });
  });

  describe('writeHandle', function () {
    beforeEach(function () {
      mockData = Buffer.alloc(0);
    });

    it('should only accept data as a buffer', function () {
      mockData = {};

      (function () {
        peripheral.writeHandle(mockHandle, mockData);
      }).should.throwError('data must be a Buffer');
    });

    it('should delegate to noble, withoutResponse false', function () {
      peripheral.writeHandle(mockHandle, mockData, false);

      mockNoble.writeHandle.calledWithExactly(mockId, mockHandle, mockData, false).should.equal(true);
    });

    it('should delegate to noble, withoutResponse true', function () {
      peripheral.writeHandle(mockHandle, mockData, true);

      mockNoble.writeHandle.calledWithExactly(mockId, mockHandle, mockData, true).should.equal(true);
    });

    it('should callback', function () {
      let calledback = false;

      peripheral.writeHandle(mockHandle, mockData, false, function () {
        calledback = true;
      });
      peripheral.emit(`handleWrite${mockHandle}`);

      calledback.should.equal(true);
    });
  });

  describe('writeHandleAsync', () => {
    beforeEach(() => {
      mockData = Buffer.alloc(0);
    });

    it('should only accept data as a buffer', async () => {
      mockData = {};

      await peripheral.writeHandleAsync(mockHandle, mockData).should.be.rejectedWith('data must be a Buffer');
    });

    it('should delegate to noble, withoutResponse false', async () => {
      const promise = peripheral.writeHandleAsync(mockHandle, mockData, false);

      peripheral.emit(`handleWrite${mockHandle}`);
      await promise;

      mockNoble.writeHandle.calledWithExactly(mockId, mockHandle, mockData, false).should.equal(true);
    });

    it('should delegate to noble, withoutResponse true', async () => {
      const promise = peripheral.writeHandleAsync(mockHandle, mockData, true);

      peripheral.emit(`handleWrite${mockHandle}`);
      await promise;

      mockNoble.writeHandle.calledWithExactly(mockId, mockHandle, mockData, true).should.equal(true);
    });

    it('should resolve', async () => {
      const promise = peripheral.writeHandleAsync(mockHandle, mockData, false);

      peripheral.emit(`handleWrite${mockHandle}`);
      await promise.should.be.resolvedWith();
    });
  });
});
