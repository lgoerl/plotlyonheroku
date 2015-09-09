'use strict';

import AppDispatcher from '../dispatchers/AppDispatcher';
import BaseStore from './BaseStore';
import AppConstants from '../constants/AppConstants';
import Collection from 'ampersand-collection';
import AppActions from '../actions/AppActions';
import request from 'request';

var _appStore = {};
var _outdated = {};

var _dependents = {};   // {b: ['a', 'd']} -> b is the parent of 'a', 'd'
var _dependencies = {}; // {a: ['b', 'c']} -> a is the child of 'b' and 'c'

var AppStore = BaseStore.extend({
    getState: function (){
        return {
            'components': _appStore,
            'meta': {
                'outdated': _outdated
            }
        };
    },
    getComponent: function (component_id) {
        // very confusing tree traversal recursion.
        var out;
        function traverse(o) {
            if(o.constructor === Array) {
                for(var i=0; i<o.length; i++) {
                    if(traverse(o[i])){return;}
                }
            } else if(o.props.id && o.props.id === component_id) {
                out = o;
                return true;
            } else if(o.children && o.children.constructor === Array) {
                if(traverse(o.children)){return;}
            }
        }
        traverse(_appStore);
        return out;
    },
    getComponentDependencies: function(component_id) {
        let dependencies_ids = this.getComponent(component_id).props.dependencies;
        let dependencies = {};
        let component;
        if(dependencies_ids) {
            for(var i=0; i<dependencies_ids.length; i++) {
                component = this.getComponent(dependencies_ids[i]);
                delete component.children;
                dependencies[dependencies_ids[i]] = component;
            }
        }
        return dependencies;
    }
});

function initialize_relationships() {
    function traverse(o) {
        if(o.props.id) {
            if(o.props.dependencies) {
                for(var i=0; i<o.props.dependencies.length; i++) {
                    if(o.props.id in _dependencies) {
                        _dependencies[o.props.id].push(o.props.dependencies[i]);
                    } else {
                        _dependencies[o.props.id] = [o.props.dependencies[i]];
                    }
                }
            }
        } if(o.children && o.children.constructor === Array) {
            for(var i=0; i<o.children.length; i++) {
                traverse(o.children[i]);
            }
        }
    }

    traverse(_appStore);

    for(var i in _dependencies) {
        for(var j=0; j<_dependencies[i].length; j++){
            if(_dependencies[i][j] in _dependents) {
                _dependents[_dependencies[i][j]].push(i);
            } else {
                _dependents[_dependencies[i][j]] = [i];
            }
        }
    }
}

function flagChildrenAsOutdated(component_id) {

    function traverse(component_id) {
        if(component_id in _dependents && _dependents[component_id].length > 0) {
            for(var i=0; i<_dependents[component_id].length; i++) {
                if(_dependents[component_id][i] in _outdated) {
                    _outdated[_dependents[component_id][i]].push(component_id);
                } else {
                    _outdated[_dependents[component_id][i]] = [component_id];
                }
                traverse(_dependents[component_id][i]);
            }
        }
    }

    traverse(component_id);

    for(var i in _outdated) {
        for(var j = _outdated[i].length - 1; j >= 0; j--) {
            if(_outdated[i][j] === component_id) {
               _outdated[i].splice(j, 1);
            }
        }
    }

    console.warn(component_id + ': ' + JSON.stringify(_outdated));
}

var actions = function(action) {
    var previous;
    let evt = action.event;
    console.log('DISPATCH-STORE:', evt, action.id);
    if(action.id){
        var component = AppStore.getComponent(action.id);
    }
    switch(evt) {
        case AppConstants.SETSELECTEDVALUE:
            component.props.selected = action.value;
            flagChildrenAsOutdated(component.props.id);
            AppStore.emitChange();
            break;

        /*
        case AppConstants.SETVALUE:
            _appStore[action.id].value = action.value;
            flagChildrenAsOutdated(component_id);
            AppStore.emitChange();
            break;

        case AppConstants.SETCHECKED:
            var options = _appStore[action.id].options;
            for(var i=0; i<options.length; i++){
                if(options[i].id == action.id) {
                    previous = options[i].isChecked;
                    options[i].isChecked = action.isChecked;
                }
            }
            // flagChildrenAsOutdated(action.id);
            AppStore.emitChange();
            break;
        */
        case AppConstants.UPDATEGRAPH:
            component.props.figure = action.figure;
            component.props.height = action.figure.layout.height + 'px';
            flagChildrenAsOutdated(component.props.id);
            AppStore.emitChange();
            break;

        case 'SETSTORE':
            _appStore = action.appStore;
            AppStore.emitChange();
            initialize_relationships();
            break;

        case AppConstants.UPDATECOMPONENT:
            // from the server
            console.log(component, '\n^^^\n', action.component);
            // javascript i'm so bad at you. mutate reference of object.
            // should probably also delete untransferred keys.
            for(var k in action.component) {
                component[k] = action.component[k];
            }
            flagChildrenAsOutdated(component.props.id);
            AppStore.emitChange();
            break;

        case AppConstants.UNMARK_COMPONENT_AS_OUTDATED:
            if(action.id in _outdated && _outdated[action.id].length === 0) {
                delete _outdated[action.id];
            }
            // emit change?
            // AppStore.emitChange();
            break;
    }
    console.log('CLEAR-STORE:', evt, action.id);
};

AppDispatcher.register(actions);

exports.AppStore = AppStore;


(function(){
    AppActions.initialize();
})();

