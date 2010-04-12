function describeFor(storageType){
    describe(storageType.name)
        .beforeAll(function(){
            localStorage.clear()
        })
        .before(function(){
            this.db = new storageType()
        })
        .after(function(){
            this.db.clear()
        })
        .should('have seq', function(){
            expect(this.db.seq()).toBe(0)
        })
        .it('should up seq when put', function(){
            this.db.put(1, {name: 'Frodo'})
            expect(this.db.seq()).toBe(1)
        })
        .should('have docCount', function(){
            expect(this.db.docCount()).toBe(0)
        })
        .it('should up docCount when put', function(){
            this.db.put(1, {name: 'Frodo'})
            expect(this.db.docCount()).toBe(1)
        })
        .it('should get back when put', function(){
            this.db.put(1, {name: 'Frodo'})
            var obj = this.db.get(1)
            expect(obj._id).toBe(1)
            expect(obj.name).toBe('Frodo')
        })
        .should('delete', function(){
            this.db.put(1, {name: 'Frodo'})
            this.db['delete'](this.db.get(1))
            expect(this.db.get(1)).toBe(undefined)
        })
        .should('do map', function(){
            this.db.put(1, {type: 'User', name: 'Frodo'})
            this.db.put('_design/user', {
                language: 'javascript',
                views: {
                    names: {
                        map: function(doc){
                            if (doc.type == 'User')
                                emit(doc._id, doc.name)
                        }.toString()
                    }
                }
            })
            var result = this.db.view('user', 'names')
            result.rows.length == 1
            var row = result.rows[0]
            expect(row.id).toBe(0)
            expect(row.key).toBe(1)
            expect(row.value).toBe('Frodo')
        })
        .should('give revs', function(){
            this.db.put(1, {name: 'Frodo'})
            var obj = this.db.get(1)
            expect(obj._rev.substring(0, 2)).toBe('1-')
        })
        .should('put again should rev up', function(){
            this.db.put(1, {name: 'Frodo'})
            var obj = this.db.get(1)
            obj.name = 'Froda'
            this.db.put(1, obj)
            obj = this.db.get(1)
            expect(obj._rev.substring(0, 2)).toBe('2-')
        })
        .should('not let you put without rev', function(){
            this.db.put(1, {name: 'Frodo'})
            expect(function(){
                this.db.put(1, {name: 'Frodo'})
            }, this).toRaise('Record was modified before you tried to saved it.')
        })
        .should('not let you put with wrong rev', function(){
            this.db.put(1, {name: 'Frodo'})
            var obj = this.db.get(1)
            obj._rev = '1-29e234829t2839'
            obj.name = 'Froda'
            expect(function(){
                this.db.put(1, obj)
            }, this).toRaise('Record was modified before you tried to saved it.')
        })
        .should('give changes', function(){
            this.db.put(1, {name: 'Frodo'})
            var obj = this.db.get(1)
            var changes = this.db.changes()
            var change = changes.results[0]
            expect(changes.last_seq).toBe(1)
            expect(change.seq).toBe(1)
            expect(change.id).toBe(obj._id)
            expect(change.changes[0].rev).toBe(obj._rev)
        })
        .should('reflect in changes when deleted', function(){
            this.db.put(1, {name: 'Frodo'})
            var frodo = this.db.get(1)
            this.db['delete'](frodo)
            console.log(JSON.stringify(this.db.changes()))
            expect(this.db.seq()).toBe(2)
            expect(this.db.changes().results[0].seq).toBe(2)
            expect(this.db.changes().results[0].deleted).toBe(true)
        })
        .should('filter changes', function(){
            this.db.put(1, {name: 'Frodo'})
            this.db.put(2, {name: 'Darth'})
            expect(this.db.changes().results.length).toBe(2)
            expect(this.db.changes({since: 1}).results.length).toBe(1)
        })
}
//describeFor(InMemoryDB)
describeFor(LocalStorageDB)