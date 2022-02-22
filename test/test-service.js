require('should');
const sinon = require('sinon');

const Service = require('../lib/service');

describe('service', function () {
  let mockNoble = null;
  const mockPeripheralId = 'mock-peripheral-id';
  const mockUuid = 'mock-uuid';

  let service = null;

  beforeEach(function () {
    mockNoble = {
      discoverIncludedServices: sinon.spy(),
      discoverCharacteristics: sinon.spy()
    };

    service = new Service(mockNoble, mockPeripheralId, mockUuid);
  });

  afterEach(function () {
    service = null;
  });

  it('should have a uuid', function () {
    service.uuid.should.equal(mockUuid);
  });

  it('should lookup name and type by uuid', function () {
    service = new Service(mockNoble, mockPeripheralId, '1800');

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
    const restored = Service.fromDump(mockNoble, dumped)
    service.toString().should.eql(restored.toString())
  });

  describe('discoverIncludedServicesAsync', function () {
    it('should delegate to noble', async () => {
      const promise = service.discoverIncludedServicesAsync();
      service.emit('includedServicesDiscover', true);
      await promise;

      mockNoble.discoverIncludedServices.calledWithExactly(mockPeripheralId, mockUuid, undefined).should.equal(true);
    });

    it('should delegate to noble, with uuids', async () => {
      const mockUuids = [];
      const promise = service.discoverIncludedServicesAsync(mockUuids);
      service.emit('includedServicesDiscover', true);
      await promise;

      mockNoble.discoverIncludedServices.calledWithExactly(mockPeripheralId, mockUuid, mockUuids).should.equal(true);
    });

    it('should resolve with data', async () => {
      const mockIncludedServiceUuids = [];

      const promise = service.discoverIncludedServicesAsync();
      service.emit('includedServicesDiscover', mockIncludedServiceUuids);
      const result = await promise;

      result.should.equal(mockIncludedServiceUuids);
    });
  });

  describe('discoverCharacteristicsAsync', () => {
    it('should delegate to noble', async () => {
      const promise = service.discoverCharacteristicsAsync();
      service.emit('characteristicsDiscover', true);
      await promise;

      mockNoble.discoverCharacteristics.calledWithExactly(mockPeripheralId, mockUuid).should.equal(true);
    });

    it('should resolve with data', async () => {
      const mockCharacteristics = [];

      const promise = service.discoverCharacteristicsAsync();
      service.emit('characteristicsDiscover', mockCharacteristics);
      const result = await promise;

      result.should.equal(mockCharacteristics);
    });
  });
});
