describe('Replicate up', {async: true})
    .before(function(){
        this.couch = new Couch({name: 'up'})
        BeanBag.clear()
        this.couch.drop(function(){
            this.couch.create(function(){
                this.finish()
            }, this)
        }, this)
    })
    .it('should replicate create', function(){
        BeanBag.put('1', {name: 'Emma'})
        BeanBag.replicateTo(this.couch.baseUrl, function(){
            this.couch.get('_all_docs', {
                include_docs: true
            }, function(data){
                console.log('got all docs')
                this.expect(data.total_rows).toBe(1)
                this.expect(data.rows[0].doc.name).toBe('Emma')
                this.finish()
            }, this)
        }, this)
    })
    .it('should replicate edit', function(){
        BeanBag.put('1', {name: 'Emma'})
        BeanBag.replicateTo(this.couch.baseUrl, function(){
            var emma = BeanBag.get('1')
            emma.name = 'Emily'
            BeanBag.put(emma._id, emma)
            BeanBag.replicateTo(this.couch.baseUrl, function(){
                this.couch.get('_all_docs', {
                    include_docs: true
                }, function(data){
                    this.expect(data.total_rows).toBe(1)
                    this.expect(data.rows[0].doc.name).toBe('Emily')
                    this.finish()
                }, this)
            }, this)
        }, this)
        
    })
    .it('should replicate delete', function(){
        BeanBag.put('1', {name: 'John'})
        BeanBag.replicateTo(this.couch.baseUrl, function(){
            var john = BeanBag.get('1')
            BeanBag['delete'](john)
            BeanBag.replicateTo(this.couch.baseUrl, function(){
                this.couch.get('_all_docs', {
                    include_docs: true
                }, function(data){
                    this.expect(data.total_rows).toBe(0)
                    this.finish()
                }, this)
            }, this)
        }, this)
        
    })
    
    .should('replicate mulitple changes', function(){
        BeanBag.put('1', {name: 'John'})
        BeanBag.put('2', {name: 'Jane'})
        BeanBag.put('3', {name: 'James'})
        BeanBag.replicateTo(this.couch.baseUrl, function(){
            this.couch.get('_all_docs', {
                include_docs: true
            }, function(data){
                this.expect(data.total_rows).toBe(3)
                this.expect(data.rows[0].doc.name).toBe('John')
                var john = BeanBag.get('1')
                john.name = 'Joan'
                BeanBag.put(john._id, john)
                var jane = BeanBag.get('2')
                BeanBag['delete'](jane)
                BeanBag.replicateTo(this.couch.baseUrl, function(){
                    this.couch.get('_all_docs', {
                        include_docs: true
                    }, function(data){
                        this.expect(data.total_rows).toBe(2)
                        this.expect(data.rows[0].doc.name).toBe('Joan')
                        this.expect(data.rows[1].doc.name).toBe('James')
                        this.finish()
                    }, this)
                }, this)
            }, this)
        }, this)
    })
    
describe('Replicate down', {async: true})
    .before(function(){
        this.couch = new Couch({name: 'down'})
        BeanBag.clear()
        this.couch.drop(function(){
            this.couch.create(function(){
                this.couch.put('1', {name: 'Emma'}, function(){
                    this.finish()
                }, this)
            }, this)
        }, this)
    })
    .should('replicate create', function(){
        BeanBag.replicateFrom(this.couch.baseUrl, function(){
            this.expect(BeanBag.get('1').name).toBe('Emma')
            this.finish()
        }, this)
    })
    .should('replicate edit', function(){
        BeanBag.replicateFrom(this.couch.baseUrl, function(){
            this.couch.get('1', null, function(doc){
                doc.name = 'Emily'
                this.couch.put(doc._id, doc, function(){
                    BeanBag.replicateFrom(this.couch.baseUrl, function(){
                        this.expect(BeanBag.get('1').name).toBe('Emily')
                        this.finish()
                    }, this)
                }, this)
            }, this)
        }, this)
    })
    .should('replicate delete', function(){
        BeanBag.replicateFrom(this.couch.baseUrl, function(){
            this.couch.get('1', null, function(doc){
                doc.name = 'Emily'
                this.couch['delete'](doc, function(){
                    BeanBag.replicateFrom(this.couch.baseUrl, function(){
                        this.expect(BeanBag.get('1')).toBe(undefined)
                        this.expect(BeanBag.docCount()).toBe(0)
                        this.finish()
                    }, this)
                }, this)
            }, this)
        }, this)
        
    })
    

window.onload = function(){
    describe.run({printTo: 'log'})
}