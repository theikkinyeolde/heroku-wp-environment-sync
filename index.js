'use strict'

exports.topic = {
    name : 'sync',
    description : 'Sync different environments. Folder needs to have sync configuration file.'
}

exports.commands = [
    require('./commands/dbsync.js'),
    require('./commands/init.js'),
    require('./commands/dump.js')
]