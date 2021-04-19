class PeripheralDb {
    constructor(){
        this.db = {}
    }
    add(peripheral){
        this.db[peripheral.id] = peripheral
    }
    find(uuid){
        return this.db[uuid]
    }
    expire(olderThan){
        for(const id in this.db){
            const p = this.db[id]
            if(p.lastSeen < olderThan) delete this.db[p]
        }
    }
}
module.exports = PeripheralDb