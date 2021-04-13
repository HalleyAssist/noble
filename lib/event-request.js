const Q = require('q-lite')
function promisify(send, event, eventProcessor, options = {retryCount: 3, retryAfter:100}){
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

        let returnValue = Q.defer()
        const toSend = ()=>returnValue.resolve(send.call(this, ...args))

        async function retryHandle(){
            const retVal = await returnValue.promise
            if(!options.retryCount){
                if(retVal === false) {
                    deferred.reject('failed to execute send')
                }
                return deferred.promise
            }
            for(let i=0;i<options.retryCount;i++){
                try {
                    await Q.timeout(deferred.promise, options.retryAfter)
                } catch(ex){
                    if(ex.code == 'ETIMEDOUT') {
                        toSend()
                        continue
                    }
                    throw ex
                }
            }

            if(retVal === false) {
                deferred.reject('failed to execute send')
            }

            return await deferred.promise
        }

        this.on(event, eventHandler)
        
        // in case send is async await on both, but we actually want to await deferred.promise
        const ret = Q.safeRace([Q.fcall(toSend), retryHandle()]).then(()=>deferred.promise).finally(()=>this.removeListener(event, eventHandler))
        
        ret.cancel = function(){
            deferred.reject(new Error('cancel'))
            if(options.cancelFn) options.cancelFn(...args)
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