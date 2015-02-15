polyclay-couch
==============

A couch persistence adapter for [Polyclay](https://github.com/ceejbot/polyclay).

[![on npm](http://img.shields.io/npm/v/numbat-emitter.svg?style=flat)](https://www.npmjs.org/package/polyclay-couch)  [![Tests](http://img.shields.io/travis/ceejbot/polyclay-couch.svg?style=flat)](http://travis-ci.org/ceejbot/polyclay-couch) ![Coverage](http://img.shields.io/badge/coverage-99%25-green.svg?style=flat) [![Dependencies](http://img.shields.io/david/ceejbot/polyclay-couch.svg?style=flat)](https://david-dm.org/ceejbot/polyclay-couch)

## How-to

See the polyclay docs for information about how to use the models.

Once you've built a polyclay model, you can mix persistence methods into it:

````javascript
polyclay.persist(ModelFunction, '_id');
polyclay.persist(RedisModelFunc, 'name');
```

You can then set up its access to CouchDB by giving it an existing Cradle connection object plus the name of the database where this model should store its objects. The couch adapter wants two fields in its options hash: a cradle connection and a database name. For instance:

```javascript
var adapterOptions =
{
    connection: new cradle.Connection(),
    dbname: 'widgets'
};
ModelFunction.setStorage(adapterOptions, polyclay.CouchAdapter);
```

If you do not pass a dbname, the adapter will fall back to using the model's `plural`. This is often the expected name for a database.

Every model instance has a pointer to the adapter on its `adapter` field. The adapter in turn gives you access to the cradle connection on `obj.adapter.connection` and the database on `obj.adapter.db`.

### Defining views

You can define views to be added to your couch databases when they are created.  Add a `design` field to your constructor function directly.

Let's add some simple views to the Widget model we created above, one to fetch widgets by owner and one to fetch them by name.

```javascript
Widget.design =
{
    views:
    {
        by_owner: { map: "function(doc) {\n  emit(doc.owner_id, doc);\n}", language: "javascript" },
        by_name: { map: "function(doc) {\n  emit(doc.name, doc);\n}", language: "javascript" }
    }
};
```

Call `Widget.provision()` to create the 'widgets' database in your CouchDB instance. It will have a design document named "_design/widgets" with the two views above defined. The provision method nothing for Redis- or LevelUP-backed models.
