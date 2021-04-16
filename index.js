const Noble = require('./lib/noble');

class NobleInstance extends Noble {
    constructor(){
        const bindings = require('./lib/resolve-bindings')();
        super(bindings)
    }
}

NobleInstance.Peripheral = require('./lib/peripheral')
NobleInstance.Service = require('./lib/service')
NobleInstance.Descriptor = require('./lib/descriptor')
NobleInstance.Characteristic = require('./lib/characteristic')

module.exports = NobleInstance