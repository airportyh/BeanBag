var dbName = 'dest'

function replicate(){
    BeanBag.replicateTo('http://' + location.host + '/' + dbName + '/')
}

function refreshServerDB(){
    var api = new API('http://' + location.host + '/')
    api['delete'](dbName, function(){
        api.put(dbName)
    })
}

function refreshLocalDB(){
    BeanBag.clear()
}