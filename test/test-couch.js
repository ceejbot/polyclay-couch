/*global describe:true, it:true, before:true, after:true */

var
    demand       = require('must'),
    cradle       = require('cradle'),
    fs           = require('fs'),
    path         = require('path'),
    polyclay     = require('polyclay'),
    util         = require('util'),
    CouchAdapter = require('../index')
	;

var testDir = process.cwd();
if (path.basename(testDir) !== 'test')
	testDir = path.join(testDir, 'test');
var attachmentdata = fs.readFileSync(path.join(testDir, 'test.png'));

describe('couch adapter', function()
{
	var modelDefinition =
	{
		properties:
		{
			name:          'string',
			created:       'date',
			foozles:       'array',
			snozzers:      'hash',
			is_valid:      'boolean',
			count:         'number',
			required_prop: 'string',
		},
		optional: [ 'computed', 'ephemeral' ],
		required: [ 'name', 'is_valid', 'required_prop'],
		singular: 'model',
		plural: 'models',
		initialize: function()
		{
			this.ran_init = true;
			this.on('before-save', this.beforeSave.bind(this));
			this.on('after-save', this.afterSave.bind(this));
			this.on('after-load', this.afterLoad.bind(this));
			this.on('before-destroy', this.beforeDestroy.bind(this));
			this.on('after-destroy', this.afterDestroy.bind(this));
		},
		methods:
		{
			beforeSave: function() { this.beforeSaveCalled = true; },
			afterSave: function() { this.afterSaveCalled = true; },
			afterLoad: function() { this.afterLoadCalled = true; },
			beforeDestroy: function() { this.beforeDestroyCalled = true; },
			afterDestroy: function() { this.afterDestroyCalled = true; },
		}
	};

	var couch_config =
	{
		host: 'localhost',
		port: 5984,
		db: 'polyclay_tests',
	};

	if (process.env.CUSER && process.env.CPASS)
	{
		couch_config.auth =
		{
			username: process.env.CUSER,
			password: process.env.CPASS
		};
	}

	var Model, instance, another, hookTest, hookid;

	before(function()
	{
		Model = polyclay.Model.buildClass(modelDefinition);

		Model.design =
		{
			views:
			{
				by_name: { map: "function(doc) {\n  emit(doc.name, doc);\n}", language: "javascript" }
			}
		};

		Model.fetchByName = function(name, callback)
		{
			Model.adapter.db.view('models/by_name', { key: name }, function(err, documents)
			{
				if (err) return callback(err);
				Model.constructMany(documents, callback);
			});
		};

		polyclay.persist(Model);
	});

	it('can be configured for database access', function(done)
	{
		var connection = new cradle.Connection(
			couch_config.host,
			couch_config.port,
			{
				cache: false,
				raw: false,
				auth: couch_config.auth
			}
		);
		var options =
		{
			connection: connection,
			dbname: couch_config.db
		};

		Model.setStorage(options, CouchAdapter);
		Model.adapter.must.exist();
		Model.adapter.db.must.exist();
		Model.adapter.connection.info(function(err, response)
		{
			demand(err).not.exist();
			response.must.be.an.object();
			done();
		});
	});

	it('can provision the database for the model', function(done)
	{
		Model.adapter.db.exists(function (err, exists)
		{
			demand(err).not.exist();
			if (exists)
				return done();
			Model.provision(function(err, res)
			{
				demand(err).not.exist();
				done();
			});
		});
	});

	it('saves views when it creates the database', function(done)
	{
		Model.adapter.db.get('_design/models', function(err, response)
		{
			demand(err).not.exist();
			response.must.have.property('views');
			response.views.must.have.property('by_name');
			done();
		});
	});

	it('can save a document in the db', function(done)
	{
		instance = new Model();
		instance.update(
		{
			name: 'test',
			created: Date.now(),
			foozles: ['three', 'two', 'one'],
			snozzers: { field: 'value' },
			is_valid: true,
			count: 3,
			required_prop: 'requirement met',
			computed: 17
		});
		instance.save(function(err, id_and_rev)
		{
			demand(err).not.exist();
			id_and_rev.must.exist();
			id_and_rev.must.be.an.object();
			instance.isDirty().must.be.false();
			instance._id.must.equal(id_and_rev.id);
			instance._rev.must.equal(id_and_rev.rev);
			done();
		});
	});

	it('can retrieve the saved document', function(done)
	{
		Model.get(instance._id, function(err, retrieved)
		{
			demand(err).not.exist();
			retrieved.must.exist();
			retrieved.must.be.an.object();
			retrieved._id.must.equal(instance._id);
			retrieved.name.must.equal(instance.name);
			retrieved.created.getTime().must.equal(instance.created.getTime());
			retrieved.is_valid.must.equal(instance.is_valid);
			retrieved.count.must.equal(instance.count);
			retrieved.computed.must.equal(instance.computed);
			done();
		});
	});

	it('can update the document', function(done)
	{
		var prevRev = instance._rev;
		instance.name = "New name";
		instance.isDirty().must.be.true();
		instance.save(function(err, response)
		{
			demand(err).not.exist();
			response.must.be.a.string();
			response.must.equal('OK');
			instance.isDirty().must.be.false();
			instance._rev.must.not.equal(prevRev);
			done();
		});
	});


	it('can fetch in batches', function(done)
	{
		var ids = [ instance._id ];
		var obj = new Model();
		obj.name = 'two';
		obj.save(function(err, response)
		{
			ids.push(obj._id);

			Model.get(ids, function(err, itemlist)
			{
				demand(err).not.exist();
				itemlist.must.be.an.array();
				itemlist.length.must.equal(2);
				done();
			});
		});
	});

	it('can fetch all', function(done)
	{
		Model.all(function(err, itemlist)
		{
			demand(err).not.exist();
			itemlist.must.be.an.array();
			itemlist.length.must.be.above(1);
			done();
		});
	});

	it('can find documents using views', function(done)
	{
		Model.fetchByName('two', function(err, itemlist)
		{
			demand(err).not.exist();
			itemlist.must.be.an.array();
			itemlist.length.must.equal(1);
			done();
		});
	});

	it('constructMany() retuns an empty list when given empty input', function(done)
	{
		Model.constructMany([], function(err, results)
		{
			demand(err).not.exist();
			results.must.be.an.array();
			results.length.must.equal(0);
			done();
		});
	});

	it('merge() updates properties then saves the object', function(done)
	{
		Model.fetchByName('two', function(err, itemlist)
		{
			demand(err).not.exist();
			var item = itemlist[0];

			item.merge({ is_valid: true, count: 1023 }, function(err, response)
			{
				demand(err).not.exist();
				Model.get(item._id, function(err, stored)
				{
					demand(err).not.exist();
					stored.count.must.equal(1023);
					stored.is_valid.must.equal(true);
					stored.name.must.equal(item.name);
					done();
				});
			});
		});
	});

	it('can add an attachment type', function()
	{
		Model.defineAttachment('frogs', 'text/plain');
		Model.defineAttachment('avatar', 'image/png');

		instance.set_frogs.must.be.a.function();
		instance.fetch_frogs.must.be.a.function();
		var property = Object.getOwnPropertyDescriptor(Model.prototype, 'frogs');
		property.get.must.be.a.function();
		property.set.must.be.a.function();
	});

	it('can save attachments', function(done)
	{
		instance.avatar = attachmentdata;
		instance.frogs = 'This is bunch of frogs.';
		var prevRev = instance._rev;
		instance.save(function(err, response)
		{
			demand(err).not.exist();
			instance.isDirty().must.equal.false;
			instance._rev.must.not.equal(prevRev);
			done();
		});
	});

	it('can retrieve attachments', function(done)
	{
		Model.get(instance._id, function(err, retrieved)
		{
			retrieved.fetch_frogs(function(err, frogs)
			{
				demand(err).not.exist();
				frogs.must.be.a.string();
				frogs.must.equal('This is bunch of frogs.');
				retrieved.fetch_avatar(function(err, imagedata)
				{
					demand(err).not.exist();
					imagedata.must.be.instanceof(Buffer);
					imagedata.length.must.equal(attachmentdata.length);
					done();
				});
			});
		});
	});

	it('can update an attachment', function(done)
	{
		instance.frogs = 'Poison frogs are awesome.';
		instance.save(function(err, response)
		{
			demand(err).not.exist();
			Model.get(instance._id, function(err, retrieved)
			{
				demand(err).not.exist();
				retrieved._rev.must.equal(instance._rev);
				retrieved.fetch_frogs(function(err, frogs)
				{
					demand(err).not.exist();
					frogs.must.equal(instance.frogs);
					retrieved.fetch_avatar(function(err, imagedata)
					{
						demand(err).not.exist();
						imagedata.length.must.equal(attachmentdata.length);
						done();
					});
				});
			});
		});
	});

	it('can store an attachment directly', function(done)
	{
		instance.frogs = 'Poison frogs are awesome, but I think sand frogs are adorable.';
		instance.saveAttachment('frogs', function(err, response)
		{
			demand(err).not.exist();
			Model.get(instance._id, function(err, retrieved)
			{
				demand(err).not.exist();
				retrieved._rev.must.equal(instance._rev);
				retrieved.fetch_frogs(function(err, frogs)
				{
					demand(err).not.exist();
					frogs.must.equal(instance.frogs);
					done();
				});
			});
		});
	});

	it('saveAttachment() clears the dirty bit', function(done)
	{
		instance.frogs = 'This is bunch of frogs.';
		var prevRev = instance._rev;
		instance.isDirty().must.equal(true);
		instance.saveAttachment('frogs', function(err, response)
		{
			demand(err).not.exist();
			instance._rev.must.not.equal(prevRev);
			instance.isDirty().must.equal(false);
			done();
		});
	});

	it('can remove an attachment', function(done)
	{
		var prevRev = instance._rev;
		instance.removeAttachment('frogs', function(err, deleted)
		{
			demand(err).not.exist();
			deleted.must.be.true();
			instance._rev.must.not.equal(prevRev);
			done();
		});
	});


	it('caches an attachment after it is fetched', function(done)
	{
		instance.avatar = attachmentdata;
		instance.save(function(err, response)
		{
			demand(err).not.exist();
			instance.isDirty().must.be.false();
			instance.fetch_avatar(function(err, imagedata)
			{
				demand(err).not.exist();
				var cached = instance.__attachments['avatar'].body;
				cached.must.exist();
				(cached instanceof Buffer).must.equal(true);
				polyclay.dataLength(cached).must.equal(polyclay.dataLength(attachmentdata));
				done();
			});
		});
	});

	it('removes an attachment when its data is set to null', function(done)
	{
		instance.avatar = null;
		instance.save(function(err, response)
		{
			demand(err).not.exist();
			Model.get(instance._id, function(err, retrieved)
			{
				demand(err).not.exist();
				retrieved.fetch_avatar(function(err, imagedata)
				{
					demand(err).not.exist();
					demand(imagedata).not.exist();
					done();
				});
			});
		});
	});

	it('emits "before-save" before saving a model', function(done)
	{
		hookTest = new Model();
		hookTest.name = 'hook test';

		hookTest.must.not.have.property('afterSaveCalled');
		hookTest.must.not.have.property('beforeSaveCalled');
		hookTest.save(function(err, res)
		{
			demand(err).not.exist();
			hookid = hookTest._id;
			hookTest.must.have.property('beforeSaveCalled');
			hookTest.beforeSaveCalled.must.equal(true);
			done();
		});
	});

	it('emits "after-save" after saving a model', function()
	{
		hookTest.must.have.property('afterSaveCalled');
		hookTest.afterSaveCalled.must.equal(true);
	});

	it('can remove a document from the db', function(done)
	{
		instance.destroy(function(err, deleted)
		{
			demand(err).not.exist();
			deleted.must.exist();
			instance.destroyed.must.be.true();
			done();
		});
	});

	it('can remove documents in batches', function(done)
	{
		var obj2 = new Model();
		obj2.name = 'two';
		obj2.save(function(err, response)
		{
			Model.fetchByName('two', function(err, itemlist)
			{
				demand(err).not.exist();
				itemlist.must.be.an.array();
				itemlist.length.must.be.above(1);
				Model.destroyMany(itemlist, function(err, response)
				{
					demand(err).not.exist();
					// TODO examine response more carefully
					done();
				});
			});
		});
	});

	// remaining uncovered cases:
	// saveAttachment() -- just a passthrough to cradle, so very low value
	// handleAttachments() -- only called by initFromStorage(), not sure it's ever been exercised

	after(function(done)
	{
		Model.adapter.db.destroy(function(err, response)
		{
			// swallow any errors because we don't actually care
			done();
		});
	});

});
