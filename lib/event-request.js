const Q = require('q-lite')
function promisify(send, event, eventProcessor, cancelFn = undefined){
    const promisified = function(...args) {
        const deferred = Q.defer()
        async function eventHandler(...args){
            try {
                const result = eventProcessor(...args)
                if(result === undefined) return // not interested, onto the next
                if(result instanceof Error) deferred.reject(result)
                else deferred.resolve(result)
            } catch(ex){
                deferred.reject(ex)
            }
        }

        this.on(event, eventHandler)
        
        // in case send is async await on both, but we actually want to await deferred.promise
        const ret = Q.safeRace([Q.fcall(()=>send.call(this, ...args)), deferred.promise]).then(()=>deferred.promise).finally(()=>this.removeListener(event, eventHandler))
        
        ret.cancel = function(){
            deferred.reject(new Error('cancel'))
            if(cancelFn) cancelFn(...args)
        }
        return ret
    }
    return promisified
}

function cancelify(fn){
    const deferred = Q.defer()
    const ret = Q.fcall(fn, deferred.resolve)
    ret.cancel = async()=>{
        const fn = await deferred.promise
        fn()
    }
    return ret
}


module.exports = {promisify, cancelify}