const Noble = require('./lib/noble');

class NobleInstance extends Noble {
    constructor(){
        const bindings = require('./lib/resolve-bindings')();
        super(bindings)
    }
}

module.exports = NobleInstance
