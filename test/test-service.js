require('should');
const sinon = require('sinon');

const Service = require('../lib/service');
const Peripheral = require('../lib/peripheral');

describe('service', function () {
  let mockNoble = null;
  const mockPeripheralId = 'mock-peripheral-id';
  const mockUuid = 'mock-uuid';
  const mockPeripheral = new Peripheral(mockPeripheralId, 'mock-address', 'mock-address-type', true, {}, 0);

  let service = null;

  beforeEach(function () {
    mockNoble = {
      discoverIncludedServices: sinon.spy(),
      discoverCharacteristics: sinon.spy()
    };

    service = new Service(mockPeripheral, mockUuid);
  });

  afterEach(function () {
    service = null;
  });

  it('should have a uuid', function () {
    service.uuid.should.equal(mockUuid);
  });

  it('should lookup name and type by uuid', function () {
    service = new Service(mockPeripheral, '1800');

    service.name.should.equal('Generic Access');
    service.type.should.equal('org.bluetooth.service.generic_access');
  });

  describe('toString', function () {
    it('should be uuid, name, type, includedServiceUuids', function () {
      service.toString().should.equal('{"uuid":"mock-uuid","name":null,"type":null,"includedServiceUuids":null}');
    });
  });

  it('should be dumpable and restorable', function () {
    const dumped = service.dump()
    const restored = Service.fromDump(dumped)
    service.toString().should.eql(restored.toString())
  });

  describe('discoverIncludedServicesAsync', function () {
    it('should delegate to noble', async () => {
      const promise = service.discoverIncludedServicesAsync(mockNoble);
      service.emit('includedServicesDiscover', true);
      await promise;

      mockNoble.discoverIncludedServices.calledWithExactly(mockPeripheralId, mockUuid, undefined).should.equal(true);
    });

    it('should delegate to noble, with uuids', async () => {
      const mockUuids = [];
      const promise = service.discoverIncludedServicesAsync(mockNoble, mockUuids);
      service.emit('includedServicesDiscover', true);
      await promise;

      mockNoble.discoverIncludedServices.calledWithExactly(mockPeripheralId, mockUuid, mockUuids).should.equal(true);
    });

    it('should resolve with data', async () => {
      const mockIncludedServiceUuids = [];

      const promise = service.discoverIncludedServicesAsync(mockNoble);
      service.emit('includedServicesDiscover', mockIncludedServiceUuids);
      const result = await promise;

      result.should.equal(mockIncludedServiceUuids);
    });
  });

  describe('discoverCharacteristicsAsync', () => {
    it('should delegate to noble', async () => {
      const promise = service.discoverCharacteristicsAsync(mockNoble);
      service.emit('characteristicsDiscover', true);
      await promise;

      mockNoble.discoverCharacteristics.calledWithExactly(mockPeripheralId, mockUuid).should.equal(true);
    });

    it('should resolve with data', async () => {
      const mockCharacteristics = [];

      const promise = service.discoverCharacteristicsAsync(mockNoble);
      service.emit('characteristicsDiscover', mockCharacteristics);
      const result = await promise;

      result.should.equal(mockCharacteristics);
    });
  });
});
