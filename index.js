const Noble = require('./lib/noble');

const Bindings = require('./lib/resolve-bindings')();

class NobleInstance extends Noble {
    constructor(){
        super(Bindings)
    }
}

NobleInstance.Bindings = Bindings;
NobleInstance.Noble = Noble
NobleInstance.Peripheral = require('./lib/peripheral')
NobleInstance.Service = require('./lib/service')
NobleInstance.Descriptor = require('./lib/descriptor')
NobleInstance.Characteristic = require('./lib/characteristic')

module.exports = NobleInstance