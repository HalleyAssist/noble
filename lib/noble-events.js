const events = require('events'),
      debug = require('debug')('noble:events')
    
class NobleEvents extends events.EventEmitter {
    emit(name, ...args){
        debug(`Received ${name}`)
        return super.emit(name, ...args)
    }
}
module.exports = NobleEvents