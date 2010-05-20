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

Couch = function Couch(options){
    if (options.url)
        this.baseUrl = options.url
    else{
        this.name = options.name
        this.host = options.host || 'localhost'
        this.port = options.port || 5984
        this.baseUrl = 'http://' + this.host + ':' + this.port + '/' + this.name + '/'
    }
}
Couch.prototype = {
    get: function(id, params, callback, context){
        var qs = this.qs(params)
        console.log('GET' + id + ' qs: ' + qs)
        this.request('GET', id + qs, params, callback, context)
    },
    post: function(id, doc, callback, context){
        this.request('POST', id, JSON.stringify(doc), callback, context)
    },
    put: function(id, doc, callback, context){
        this.request('PUT', id, JSON.stringify(doc), callback, context)
    },
    'delete': function(doc, callback, context){
        this.request('DELETE', doc._id + '?rev=' + doc._rev, null, callback, context)
    },
    view: function(viewPath, params, callback, context){
        this.get(this.expandViewPath(viewPath, params), callback, context)
    },  
    drop: function(callback, context){
        this.request('DELETE', '', null, callback, context)
    },
    create: function(callback, context){
        this.request('PUT', '', null, callback, context)
    },
    qs: function(params){
        if (!params) return ''
        return '?' + keys(params).map(function(key){return key + '=' + encodeURI(params[key])}).join('&')
    },
    expandViewPath: function expandViewPath(viewPath, params){
      var parts = viewPath.split('/')
      var viewPath = '_design/' + parts[0] + '/_view/' + parts[1]
      viewPath += this.qs(params)
      //sys.debug('viewPath: ' + viewPath)
      return viewPath
    },
    request: function request(verb, uri, data, callback, context){
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
        var url = this.baseUrl + uri
        console.log(verb + ': ' + url)
        xhr.open(verb, url, true)
        xhr.send(data)
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
    put: function(id, obj, newEdits){
        if (newEdits === undefined) newEdits = true
        else newEdits = false
        id = String(id)
        obj._id = id
        var org = this.get(id)
        if (newEdits && org && (org._rev != obj._rev))
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
        console.log(id + ': ' + obj)
        return obj ? JSON.parse(obj): obj
    },
    'delete': function(obj, newEdits){
        if (newEdits === undefined) newEdits = true
        else newEdits = false
        var id = obj._id
        var org = this.get(id)
        if (newEdits && org && (obj._rev != org._rev))
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
    replicateTo: function(couchUrl, callback, context){
        var escape = encodeURIComponent
        var couch = new Couch({url: couchUrl})
        console.log('replicateTo(' + couchUrl + ')')
        var repID = '_local/' + MD5(location.host + ':' + couchUrl)
        var sessionID = MD5(String(new Date().getTime()))
        couch.get('', null, function(db){
            console.log('db: ' + JSON.stringify(db))
            console.log('repID: ' + repID)
            couch.get(escape(repID), null, function(repInfo){
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
                couch.post('_missing_revs', missingRevs, function(reply){
                    //console.log('replied missing revs: ' + JSON.stringify(reply))
                    missingRevs = reply.missing_revs
                    console.log('Missing Revs: ' + JSON.stringify(missingRevs))
                    var bulkDocs = this.createBulkDocs(missingRevs)
                    console.log('bulk docs: ' + JSON.stringify(bulkDocs))
                    couch.post('_bulk_docs', bulkDocs, function(reply){
                        couch.post('_ensure_full_commit', 'true', function(reply){
                            console.log('here')
                            if (reply.ok){
                                couch.put(escape(repID), repInfo, function(reply){
                                    /*
                                    if (reply.ok) alert('Replication succeeded!')
                                    else alert('Replication failed.')*/
                                })
                                
                            }
                            if (callback)
                                callback.call(context)
                        }, this)
                    }, this)
                }, this)
            }, this)
        }, this)
    },
    replicateFrom: function(couchUrl, callback, context){
        var couch = new Couch({url: couchUrl})
        couch.get('_changes', {
            style: 'all_docs',
            heartbeat: 10000,
            since: this.seq(),
            feed: 'normal'
        }, function(changes){
            var lastSeq = changes.last_seq
            var results = changes.results
            results.forEach(function(change){
                couch.get(change.id, {
                    open_revs: JSON.stringify(change.changes.map(function(rev){
                        return rev.rev
                    })),
                    revs: true,
                    latest: true
                }, function(resp){
                    var doc = resp[0].ok
                    if (doc){
                        if (doc._deleted){
                            this['delete'](doc, false)
                        }else{
                            this.put(doc._id, doc, false)
                        }
                        this.store.seq = lastSeq
                    }else{
                        throw new Error("Failed to got change for doc.")
                    }
                    if (callback)
                        callback.call(context)
                }, this)
            }, this)
        }, this)
    }
}


BeanBag = new LocalStorageDB()