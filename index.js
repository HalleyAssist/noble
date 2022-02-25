const Noble = require('./lib/noble');

const Bindings = require('./lib/hci-socket/bindings')

class NobleInstance extends Noble {
    constructor(){
        super(new Bindings())
    }
}

NobleInstance.Bindings = Bindings;
NobleInstance.Noble = Noble
NobleInstance.Peripheral = require('./lib/peripheral')
NobleInstance.Service = require('./lib/service')
NobleInstance.Descriptor = require('./lib/descriptor')
NobleInstance.Characteristic = require('./lib/characteristic')
NobleInstance.PeripheralDb = require('./lib/peripheraldb')

module.exports = NobleInstance