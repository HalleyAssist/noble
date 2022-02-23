class HandleMap {
    constructor(){
        this._handleIndexed = new Map()
        this._uuidIndexed = new Map()
    }
    getUuid(handle){
        return this._handleIndexed.get(handle)
    }
    getHandle(uuid){
        return this._uuidIndexed.get(uuid)
    }
    addHandle(handle, uuid){
        this._handleIndexed.set(handle, uuid)
        this._uuidIndexed.set(uuid, handle)
    }
    removeHandle(handle){
        const uuid = this._handleIndexed.get(handle)
        if(uuid){
            this._handleIndexed.delete(handle)
            this._uuidIndexed.delete(uuid)
        }
    }
}

module.export = HandleMap;