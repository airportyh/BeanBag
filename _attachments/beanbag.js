function keys(obj){
    var ret = []
    for (var key in obj)
        ret.push(key)
    return ret
}
function clone(obj){
    var ret = {}
    for (var key in obj)
        ret[key] = obj[key]
    return ret
}
function callAPI(url, method, param, callback, context){
    function _callback(){
        if (this.readyState == 4){
            var result
            try{
                result = JSON.parse(this.responseText)
            }catch(e){
                console.log('Parse JSON failed: ' + this.responseText)
                result = null
            }
            callback.call(context, result)
        }else if(this.readyState == 1){
            this.setRequestHeader('Accept', 'application/json')
        }
    }
    
    var xhr = new XMLHttpRequest()
    xhr.onreadystatechange = callback ? _callback : null
    xhr.open(method, url, true)
    xhr.send(param)
}

API = function(url){
    this.url = url
}
API.prototype = {
    get: function(uri, callback, context){
        callAPI(this.url + uri, 'GET', null, callback, context)
    },
    put: function(uri, param, callback, context){
        callAPI(this.url + uri, 'PUT', JSON.stringify(param), callback, context)
    },
    post: function(uri, param, callback, context){
        callAPI(this.url + uri, 'POST', JSON.stringify(param), callback, context)
    },
    'delete': function(uri, callback, context){
        callAPI(this.url + uri, 'DELETE', null, callback, context)
    }
}



InMemoryDB = function InMemoryDB(){
    this.store = {}
}
InMemoryDB.prototype = {
    put: function(id, obj){
        obj._id = id
        this.store[id] = obj
    },
    get: function(id){
        return this.store[id]
    },
    'delete': function(id){
        delete this.store[id]
    },
    clear: function(id){
        this.store = {}
    }
}

LocalStorageDB = function LocalStorageDB(){
    this.store = localStorage
    this.__initSeq()
    this.__initChanges()
}
LocalStorageDB.prototype = {
    put: function(id, obj){
        obj._id = String(id)
        var org = this.get(id)
        if (org && (org._rev != obj._rev))
            throw new Error('Record was modified before you tried to saved it.')
        var ver = obj._rev ? parseInt(obj._rev.split('-')[0]) + 1 : 1
        delete obj._rev
        obj._rev = ver + '-' + MD5(JSON.stringify(obj))
        this.store[id] = JSON.stringify(obj)
        this.__updateSeq()
        var changes = this.__changes()
        var change = changes[id] || {id: id}
        change.seq = this.seq()
        change.changes = [{
            rev: obj._rev
        }]
        changes[id] = change
        this.__changes(changes)
    },
    get: function(id){
        var obj = this.store[id]
        return obj ? JSON.parse(obj): obj
    },
    'delete': function(obj){
        var id = obj._id
        var org = this.get(id)
        if (obj._rev != org._rev)
            throw new Error('Record was modified before you tried to delete it.')
        delete this.store[id]
        var ver = obj._rev ? parseInt(obj._rev.split('-')[0]) + 1 : 1
        delete obj._rev
        obj._rev = ver + '-' + MD5(String(null))
        this.__updateSeq()
        var changes = this.__changes()
        var change = changes[id] || {id: id}
        change.seq = this.seq()
        change.deleted = true
        change._deletedRev = org._rev.split('-')[1]
        change.changes = [{rev: obj._rev}]
        changes[id] = change
        this.__changes(changes)
    },
    view: function(docId, viewId){
        var designDoc = this.get('_design/' + docId)
        var view = designDoc.views[viewId]
        var mapFunc = (function(){
            var emit = function(key, value){
                rows.push({id: rowCount++, key: key, value: value})
            }
            return eval('(' + view.map + ')')
        })()
        var rows, rowCount = 0
        var results = {rows: rows = []}
        for (var i = 0; i < this.store.length; i++){
            var id = this.store.key(i)
            if (id == 'seq' || id == 'changes') continue
            var obj = this.get(id)
            mapFunc(obj)
        }
        return results
    },
    __initSeq: function(){
        var seq = this.store.seq
        if (seq == null)
            this.store.seq = 0
    },
    __updateSeq: function(){
        var seq = this.store.seq
        this.store.seq = seq ? parseInt(seq) + 1 : 0
    },
    seq: function(){
        return parseInt(this.store.seq)
    },
    docCount: function(){
        return this.store.length - 2
    },
    clear: function(){
        this.store.clear()
        this.__initSeq()
        this.__initChanges()
    },
    __initChanges: function(){
        if (!this.store.changes)
            this.store.changes = '{}'
    },
    __changes: function(chg){
        if (chg === undefined){
            return JSON.parse(this.store.changes)
        }else{
            this.store.changes = JSON.stringify(chg)
        }
    },
    changes: function(opts){
        var since = opts ? (opts.since || -1) : -1
        var results
        var ret = {results: results = [], last_seq: this.seq()}
        var changes = this.__changes()
        for (var id in changes){
            var change = changes[id]
            if (change.seq > since)
                results.push(change)
        }
        return ret
    },
    missingRevs: function(since){
        var ret = {}
        var changes = this.__changes()
        for (var id in changes){
            var change = changes[id]
            if (change.seq > since)
                ret[id] = change.changes.map(function(c){return c.rev})
        }
        return ret
    },
    createBulkDocs: function(missingRevs){
        var docs
        var ret = {
            new_edits: false,
            docs: docs = []
        }
        for (var id in missingRevs){
            var doc = this.get(id)
            var rev = missingRevs[id][0]
            
            var revParts = rev.split('-')
            //console.log('doc: ' + JSON.stringify(doc))
            if (doc){
                doc = clone(doc)
                doc._revisions = {
                    start: parseInt(revParts[0]),
                    ids: [revParts[1]]
                }
            }else{
                doc = {
                    _id: id,
                    _rev: rev,
                    _deleted: true
                }
                var change = this.__changes()[id]
                doc._revisions = {
                    start: parseInt(revParts[0]),
                    ids: [revParts[1], change._deletedRev]
                }
            }
            docs.push(doc)
        }
        return ret
    },
    replicateTo: function(couchUrl){
        var escape = encodeURIComponent
        api = new API(couchUrl)
        console.log('replicateTo(' + couchUrl + ')')
        var repID = '_local/' + MD5(location.host + ':' + couchUrl)
        var sessionID = MD5(String(new Date().getTime()))
        api.get('', function(db){
            console.log('update_seq: ' + db.update_seq)
            console.log('repID: ' + repID)
            api.get(escape(repID), function(repInfo){
                console.log(JSON.stringify(repInfo))
                if (repInfo.error == 'not_found'){
                    refInfo = {
                        _id: repID, 
                        _rev: "0-0",
                        session_id: sessionID,
                        source_last_seq: 0,
                        history: []}
                }
                var missingRevs = this.missingRevs(db.update_seq)
                
                console.log('changes to replicate: ' + JSON.stringify(missingRevs))
                if (keys(missingRevs).length == 0) return
                api.post('_missing_revs', missingRevs, function(reply){
                    //console.log('replied missing revs: ' + JSON.stringify(reply))
                    missingRevs = reply.missing_revs
                    console.log('Missing Revs: ' + JSON.stringify(missingRevs))
                    var bulkDocs = this.createBulkDocs(missingRevs)
                    console.log('bulk docs: ' + JSON.stringify(bulkDocs))
                    api.post('_bulk_docs', bulkDocs, function(reply){
                        api.post('_ensure_full_commit', 'true', function(reply){
                            if (reply.ok){
                                api.put(escape(repID), repInfo, function(reply){
                                    if (reply.ok) alert('Replication succeeded!')
                                    else alert('Replication failed.')
                                })
                            }
                        }, this)
                    }, this)
                }, this)
            }, this)
        }, this)
    }
}


BeanBag = new LocalStorageDB()