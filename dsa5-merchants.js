const MODULE_NAMESPACE = "dsa5-merchants";

import ActorSheetdsa5NPC from "../../systems/dsa5/modules/actor/npc-sheet.js";

class QuantityDialog extends Dialog {
    constructor(callback, options) {
        if (typeof (options) !== "object") {
            options = {};
        }

        let applyChanges = false;
        super({
            title: "Quantity",
            content: `
            <form>
                <div class="form-group">
                    <label>Quantity:</label>
                    <input type=number min="1" id="quantity" name="quantity" value="1">
                </div>
            </form>`,
            buttons: {
                yes: {
                    icon: "<i class='fas fa-check'></i>",
                    label: options.acceptLabel ? options.acceptLabel : "Accept",
                    callback: () => applyChanges = true
                },
                no: {
                    icon: "<i class='fas fa-times'></i>",
                    label: "Abbruch"
                },
            },
            default: "yes",
            close: () => {
                if (applyChanges) {
                    var quantity = document.getElementById('quantity').value

                    if (isNaN(quantity)) {
                        console.log("Loot Sheet | Item quantity invalid");
                        return ui.notifications.error(`Item quantity invalid.`);
                    }

                    callback(quantity);

                }
            }
        });
    }
}

class DSA5Merchants extends ActorSheetdsa5NPC {

    static SOCKET = "module.dsa5-merchants";

    get template() {
        Handlebars.registerHelper('stringify', function (e) {
            return '' //JSON.stringify(e, null, 2)
        });

        Handlebars.registerHelper('notNull', function(value, options) {
            return (value.items && value.items.length)
        });

        Handlebars.registerHelper('equals', function (arg1, arg2, options) {
            return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
        });

        Handlebars.registerHelper('unequals', function (arg1, arg2, options) {
            return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
        });

        Handlebars.registerHelper('formatprice', function (basePrice, modifier) {
            let priceString = Math.round(basePrice * modifier * 100).toString();
            let dukaten = (priceString.length > 3) ? parseInt(priceString.substr(0, priceString.length - 3)) : 0
            let silber = (priceString.length > 2) ? parseInt(priceString.substr(priceString.length - 3, 1)) : 0
            let heller = (priceString.length > 1) ? parseInt(priceString.substr(priceString.length - 2, 1)) : 0
            let kreuzer = parseInt(priceString.substr(priceString.length - 1, 1))

            let result = ''
            if (dukaten) result += `${dukaten}D `
            if (silber) result += `${silber}S `
            if (heller) result += `${heller}H `
            if (kreuzer) result += `${kreuzer}K`
            return result
        });

        Handlebars.registerHelper('lootsheetstackweight', function (weight, qty) {
            let showStackWeight = game.settings.get(MODULE_NAMESPACE, "showStackWeight");
            if (showStackWeight) {
                return `/${(weight * qty).toLocaleString('en')}`;
            }
            else {
                return ""
            }

        });

        Handlebars.registerHelper('lootsheetweight', function (weight) {
            return (Math.round(weight * 1e5) / 1e5).toString();
        });

        const path = "systems/dsa5/templates/actors/";
        if (!game.user.isGM && this.actor.limited) return path + "npc-limited.html";
        return "modules/dsa5-merchants/template/npc-sheet.html";
    }

    static get defaultOptions() {
        const options = super.defaultOptions;
        mergeObject(options, {
            classes: ["dsa5 sheet actor npc npc-sheet loot-sheet-npc"],
            width: 890,
            height: 750
        });
        return options;
    }


    // provide Data for Template
    async getData() {
        const sheetData = super.getData();

        // Prepare GM Settings
        this._prepareGMSettings(sheetData.actor);


        //console.log("game.user: ", game.user);
        if (game.user.isGM) sheetData.isGM = true;
        else sheetData.isGM = false;

        let lootsheettype = await this.actor.getFlag(MODULE_NAMESPACE, "lootsheettype");
        if (!lootsheettype) await this.actor.setFlag(MODULE_NAMESPACE, "lootsheettype", "Merchant");
        lootsheettype = await this.actor.getFlag(MODULE_NAMESPACE, "lootsheettype");


        let priceModifier = 1.0;
        if (lootsheettype === "Merchant") {
            priceModifier = await this.actor.getFlag(MODULE_NAMESPACE, "priceModifier");
            if (!priceModifier) await this.actor.setFlag(MODULE_NAMESPACE, "priceModifier", 1.0);
            priceModifier = await this.actor.getFlag(MODULE_NAMESPACE, "priceModifier");
        }

        let totalWeight = 0;
        this.actor.data.items.forEach((item) => totalWeight += Math.round((item.data.quantity * item.data.weight * 100) / 100));

        let totalPrice = 0;
        this.actor.data.items.forEach((item) => totalPrice += Math.round((item.data.quantity * item.data.price * priceModifier * 100) / 100));

        let totalQuantity = 0;
        this.actor.data.items.forEach((item) => totalQuantity += Math.round((item.data.quantity * 100) / 100));

        sheetData.lootsheettype = lootsheettype;
        sheetData.totalItems = this.actor.data.items.length;
        sheetData.totalWeight = totalWeight.toLocaleString('en');
        sheetData.totalPrice = totalPrice.toLocaleString('en') + " gp";
        sheetData.totalQuantity = totalQuantity;
        sheetData.priceModifier = priceModifier;
        sheetData.rolltables = game.tables.entities;
        sheetData.lootAll = game.settings.get(MODULE_NAMESPACE, "lootAll");

        // Return data for rendering
        return sheetData;
    }


    /* -------------------------------------------- */
    /*  Event Listeners and Handlers
    /* -------------------------------------------- */

    /**
     * Activate event listeners using the prepared sheet HTML
     * @param html {HTML}   The prepared HTML object ready to be rendered into the DOM
     */
    activateListeners(html) {
        super.activateListeners(html);
        if (this.options.editable) {
            // Toggle Permissions
            html.find('.permission-proficiency').click(ev => this._onCyclePermissionProficiency(ev));
            html.find('.permission-proficiency-bulk').click(ev => this._onCyclePermissionProficiencyBulk(ev));

            // Price Modifier
            html.find('.price-modifier').click(ev => this._priceModifier(ev));

            html.find('.merchant-settings').change(ev => this._merchantSettingChange(ev));
            html.find('.update-inventory').click(ev => this._merchantInventoryUpdate(ev));

            html.find('.generate-menu').click(ev => this._merchantInventoryUpdate(ev));
        }

        // Buy Item
        html.find('.item-buy').click(ev => this._buyItem(ev));
        html.find('.item-buyall').click(ev => this._buyItem(ev, 1));

        // Sheet Type
        html.find('.sheet-type').change(ev => this._changeSheetType(ev, html));

    }

    /* -------------------------------------------- */

    /**
     * Handle merchant settings change
     * @private
     */
    async _merchantSettingChange(event, html) {
        event.preventDefault();
        console.log("Loot Sheet | Merchant settings changed");

        const expectedKeys = ["rolltable", "shopQty", "itemQty", "itemQtyLimit", "clearInventory", "itemOnlyOnce"];

        let targetKey = event.target.name.split('.')[3];


        if (expectedKeys.indexOf(targetKey) === -1) {
            console.log(`Loot Sheet | Error changing stettings for "${targetKey}".`);
            return ui.notifications.error(`Error changing stettings for "${targetKey}".`);
        }

        if (targetKey == "clearInventory" || targetKey == "itemOnlyOnce") {
            console.log(targetKey + " set to " + event.target.checked);
            await this.actor.setFlag(MODULE_NAMESPACE, targetKey, event.target.checked);
        } else if (event.target.value) {
            console.log(targetKey + " set to " + event.target.value);
            console.log("A");
            await this.actor.setFlag(MODULE_NAMESPACE, targetKey, event.target.value);
        } else {
            console.log(targetKey + " set to " + event.target.value);
            console.log("B");
            await this.actor.unsetFlag(MODULE_NAMESPACE, targetKey, event.target.value);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle merchant inventory update
     * @private
     */
    async _merchantInventoryUpdate(event, html) {
        event.preventDefault();

        const moduleNamespace = MODULE_NAMESPACE;
        const rolltableName = this.actor.getFlag(moduleNamespace, "rolltable");
        const shopQtyFormula = this.actor.getFlag(moduleNamespace, "shopQty") || "1";
        const itemQtyFormula = this.actor.getFlag(moduleNamespace, "itemQty") || "1";
        const itemQtyLimit = this.actor.getFlag(moduleNamespace, "itemQtyLimit") || "0";
        const clearInventory = this.actor.getFlag(moduleNamespace, "clearInventory");
        const itemOnlyOnce = this.actor.getFlag(moduleNamespace, "itemOnlyOnce");
        const reducedVerbosity = game.settings.get(MODULE_NAMESPACE, "reduceUpdateVerbosity");

        let shopQtyRoll = new Roll(shopQtyFormula);
        shopQtyRoll.roll();

        let rolltable = game.tables.getName(rolltableName);
        if (!rolltable) {
            //console.log(`Loot Sheet | No Rollable Table found with name "${rolltableName}".`);
            return ui.notifications.error(`No Rollable Table found with name "${rolltableName}".`);
        }

        if (itemOnlyOnce) {
            if (rolltable.results.length < shopQtyRoll.total) {
                return ui.notifications.error(`Cannot create a merchant with ${shopQtyRoll.total} unqiue entries if the rolltable only contains ${rolltable.results.length} items`);
            }
        }

        //console.log(rolltable);

        if (clearInventory) {

            let currentItems = this.actor.data.items.map(i => i._id);
            await this.actor.deleteEmbeddedEntity("OwnedItem", currentItems);
            //console.log(currentItems);
        }

        console.log(`Loot Sheet | Adding ${shopQtyRoll.result} new items`);

        if (!itemOnlyOnce) {
            for (let i = 0; i < shopQtyRoll.total; i++) {
                const rollResult = rolltable.roll();
                //console.log(rollResult);
                let newItem = null;

                if (rollResult.results[0].collection === "Item") {
                    newItem = game.items.get(rollResult.results[0].resultId);
                }
                else {
                    //Try to find it in the compendium
                    const items = game.packs.get(rollResult.results[0].collection);
                    newItem = await items.getEntity(rollResult.results[0].resultId);
                }
                if (!newItem || newItem === null) {
                    //console.log(`Loot Sheet | No item found "${rollResult.results[0].resultId}".`);
                    return ui.notifications.error(`No item found "${rollResult.results[0].resultId}".`);
                }

                let itemQtyRoll = new Roll(itemQtyFormula);
                itemQtyRoll.roll();
                console.log(`Loot Sheet | Adding ${itemQtyRoll.total} x ${newItem.name}`)

                //newItem.data.quantity = itemQtyRoll.result;

                let existingItem = this.actor.items.find(item => item.data.name == newItem.name);

                if (existingItem === null) {
                    await this.actor.createEmbeddedEntity("OwnedItem", newItem);
                    console.log(`Loot Sheet | ${newItem.name} does not exist.`);
                    existingItem = this.actor.items.find(item => item.data.name == newItem.name);
                    console.log("\n\n line 308", existingItem, '\n\n')

                    if (itemQtyLimit > 0 && Number(itemQtyLimit) < Number(itemQtyRoll.total)) {
                        await existingItem.update({ "data.quantity": itemQtyLimit });
                        if (!reducedVerbosity) ui.notifications.info(`Added new ${itemQtyLimit} x ${newItem.name}.`);
                    } else {
                        await existingItem.update({ "data.quantity": itemQtyRoll.total });
                        if (!reducedVerbosity) ui.notifications.info(`Added new ${itemQtyRoll.total} x ${newItem.name}.`);
                    }
                }
                else {
                    console.log(`Loot Sheet | Item ${newItem.name} exists.`);

                    let newQty = Number(existingItem.data.quantity) + Number(itemQtyRoll.total);

                    if (itemQtyLimit > 0 && Number(itemQtyLimit) === Number(existingItem.data.quantity)) {
                        if (!reducedVerbosity) ui.notifications.info(`${newItem.name} already at maximum quantity (${itemQtyLimit}).`);
                    }
                    else if (itemQtyLimit > 0 && Number(itemQtyLimit) < Number(newQty)) {
                        //console.log("Exceeds existing quantity, limiting");
                        await existingItem.update({ "data.data.quantity": itemQtyLimit });
                        if (!reducedVerbosity) ui.notifications.info(`Added additional quantity to ${newItem.name} to the specified maximum of ${itemQtyLimit}.`);
                    } else {
                        await existingItem.update({ "data.data.quantity": newQty });
                        if (!reducedVerbosity) ui.notifications.info(`Added additional ${itemQtyRoll.total} quantity to ${newItem.name}.`);
                    }
                }
            }
        }
        else {
            // Get a list which contains indexes of all possible results

            const rolltableIndexes = []

            // Add one entry for each weight an item has
            for (let index in [...Array(rolltable.results.length).keys()]) {
                let numberOfEntries = rolltable.data.results[index].weight
                for (let i = 0; i < numberOfEntries; i++) {
                    rolltableIndexes.push(index);
                }
            }

            // Shuffle the list of indexes
            var currentIndex = rolltableIndexes.length, temporaryValue, randomIndex;

            // While there remain elements to shuffle...
            while (0 !== currentIndex) {

                // Pick a remaining element...
                randomIndex = Math.floor(Math.random() * currentIndex);
                currentIndex -= 1;

                // And swap it with the current element.
                temporaryValue = rolltableIndexes[currentIndex];
                rolltableIndexes[currentIndex] = rolltableIndexes[randomIndex];
                rolltableIndexes[randomIndex] = temporaryValue;
            }

            // console.log(`Rollables: ${rolltableIndexes}`)

            let indexesToUse = [];
            let numberOfAdditionalItems = 0;
            // Get the first N entries from our shuffled list. Those are the indexes of the items in the roll table we want to add
            // But because we added multiple entries per index to account for weighting, we need to increase our list length until we got enough unique items
            while (true) {
                let usedEntries = rolltableIndexes.slice(0, shopQtyRoll.total + numberOfAdditionalItems);
                // console.log(`Distinct: ${usedEntries}`);
                let distinctEntris = [...new Set(usedEntries)];

                if (distinctEntris.length < shopQtyRoll.total) {
                    numberOfAdditionalItems++;
                    // console.log(`numberOfAdditionalItems: ${numberOfAdditionalItems}`);
                    continue;
                }

                indexesToUse = distinctEntris
                // console.log(`indexesToUse: ${indexesToUse}`)
                break;
            }

            for (const index of indexesToUse) {
                let itemQtyRoll = new Roll(itemQtyFormula);
                itemQtyRoll.roll();

                let newItem = null

                if (rolltable.results[index].collection === "Item") {
                    newItem = game.items.get(rolltable.results[index].resultId);
                }
                else {
                    //Try to find it in the compendium
                    const items = game.packs.get(rolltable.results[index].collection);
                    newItem = await items.getEntity(rolltable.results[index].resultId);
                }
                if (!newItem || newItem === null) {
                    return ui.notifications.error(`No item found "${rolltable.results[index].resultId}".`);
                }

                await this.actor.createEmbeddedEntity("OwnedItem", newItem);
                let existingItem = this.actor.items.find(item => item.data.name == newItem.name);

                if (itemQtyLimit > 0 && Number(itemQtyLimit) < Number(itemQtyRoll.total)) {
                    await existingItem.update({ "data.quantity": itemQtyLimit });
                    if (!reducedVerbosity) ui.notifications.info(`Added new ${itemQtyLimit} x ${newItem.name}.`);
                } else {
                    await existingItem.update({ "data.quantity": itemQtyRoll.total });
                    if (!reducedVerbosity) ui.notifications.info(`Added new ${itemQtyRoll.total} x ${newItem.name}.`);
                }
            }
        }
    }

    _createRollTable() {

        let type = "weapon";

        game.packs.map(p => p.collection);

        const pack = game.packs.find(p => p.collection === "dsa5.items");

        let i = 0;

        let output = [];

        pack.getIndex().then(index => index.forEach(function (arrayItem) {
            var x = arrayItem._id;
            //console.log(arrayItem);
            i++;
            pack.getEntity(arrayItem._id).then(packItem => {

                if (packItem.type === type) {

                    //console.log(packItem);

                    let newItem = {
                        "_id": packItem._id,
                        "flags": {},
                        "type": 1,
                        "text": packItem.name,
                        "img": packItem.img,
                        "collection": "Item",
                        "resultId": packItem._id,
                        "weight": 1,
                        "range": [
                            i,
                            i
                        ],
                        "drawn": false
                    };

                    output.push(newItem);

                }
            });
        }));

        console.log(output);
        return;
    }

    /* -------------------------------------------- */

    /**
     * Handle sheet type change
     * @private
     */
    async _changeSheetType(event, html) {
        event.preventDefault();
        console.log("DSA5 Merchant | Sheet Type changed", event);
        let currentActor = this.actor;
        let selectedIndex = event.target.selectedIndex;
        let selectedItem = event.target[selectedIndex].value;
        await currentActor.setFlag(MODULE_NAMESPACE, "lootsheettype", selectedItem);
    }

    
    /* -------------------------------------------- */

    /**
     * Handle buy item
     * @private
     */
    _buyItem(event, all = 0) {
        event.preventDefault();
        console.log("Loot Sheet | Buy Item clicked");

        let targetGm = null;
        game.users.forEach((u) => {
            if (u.isGM && u.active && u.viewedScene === game.user.viewedScene) {
                targetGm = u;
            }
        });

        if (!targetGm) {
            return ui.notifications.error("No active GM on your scene, they must be online and on the same scene to purchase an item.");
        }

        if (this.token === null) {
            return ui.notifications.error(`You must purchase items from a token.`);
        }
        if (!game.user.actorId) {
            console.log("Loot Sheet | No active character for user");
            return ui.notifications.error(`No active character for user.`);
        }

        let itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
        const item = this.actor.getEmbeddedEntity("OwnedItem", itemId);

        const packet = {
            type: "buy",
            buyerId: game.user.actorId,
            tokenId: this.token.id,
            itemId: itemId,
            quantity: 1,
            processorId: targetGm.id
        };

        if (all || event.shiftKey) {
            packet.quantity = item.data.quantity;
        }

        if (item.data.quantity === packet.quantity) {
            console.log("LootSheet5e", "Sending buy request to " + targetGm.name, packet);
            game.socket.emit(DSA5Merchants.SOCKET, packet);
            return;
        }

        let d = new QuantityDialog((quantity) => {
            packet.quantity = quantity;
            console.log("LootSheet5e", "Sending buy request to " + targetGm.name, packet);
            game.socket.emit(DSA5Merchants.SOCKET, packet);
        },
            {
                acceptLabel: "Kaufen"
            }
        );
        d.render(true);
    }


    /* -------------------------------------------- */

    /**
     * Handle price modifier
     * @private
     */
    async _priceModifier(event) {
        event.preventDefault();
        //console.log("Loot Sheet | Price Modifier clicked");
        //console.log(this.actor.isToken);

        let priceModifier = await this.actor.getFlag(MODULE_NAMESPACE, "priceModifier");
        if (!priceModifier) priceModifier = 1.0;

        priceModifier = Math.round(priceModifier * 100);

        var html = "<p>Use this slider to increase or decrease the price of all items in this inventory. <i class='fa fa-question-circle' title='This uses a percentage factor where 100% is the current price, 0% is 0, and 200% is double the price.'></i></p>";
        html += '<p><input name="price-modifier-percent" id="price-modifier-percent" type="range" min="0" max="200" value="' + priceModifier + '" class="slider"></p>';
        html += '<p><label>Percentage:</label> <input type=number min="0" max="200" value="' + priceModifier + '" id="price-modifier-percent-display"></p>';
        html += '<script>var pmSlider = document.getElementById("price-modifier-percent"); var pmDisplay = document.getElementById("price-modifier-percent-display"); pmDisplay.value = pmSlider.value; pmSlider.oninput = function() { pmDisplay.value = this.value; }; pmDisplay.oninput = function() { pmSlider.value = this.value; };</script>';

        let d = new Dialog({
            title: "Price Modifier",
            content: html,
            buttons: {
                one: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Update",
                    callback: () => this.actor.setFlag(MODULE_NAMESPACE, "priceModifier", document.getElementById("price-modifier-percent").value / 100)
                },
                two: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel",
                    callback: () => console.log("Loot Sheet | Price Modifier Cancelled")
                }
            },
            default: "two",
            close: () => console.log("Loot Sheet | Price Modifier Closed")
        });
        d.render(true);
    }


    /* -------------------------------------------- */

    /**
     * Handle cycling permissions
     * @private
     */
    _onCyclePermissionProficiency(event) {

        event.preventDefault();

        //console.log("Loot Sheet | this.actor.data.permission", this.actor.data.permission);


        let actorData = this.actor.data;


        let field = $(event.currentTarget).siblings('input[type="hidden"]');

        let level = parseFloat(field.val());
        if (typeof level === undefined) level = 0;

        //console.log("Loot Sheet | current level " + level);

        const levels = [0, 3, 2]; //const levels = [0, 2, 3];

        let idx = levels.indexOf(level),
            newLevel = levels[(idx === levels.length - 1) ? 0 : idx + 1];

        //console.log("Loot Sheet | new level " + newLevel);

        let playerId = field[0].name;

        //console.log("Loot Sheet | Current actor: " + playerId);

        this._updatePermissions(actorData, playerId, newLevel, event);

        this._onSubmit(event);
    }

    /* -------------------------------------------- */

    /**
     * Handle cycling bulk permissions
     * @private
     */
    _onCyclePermissionProficiencyBulk(event) {
        event.preventDefault();

        let actorData = this.actor.data;

        let field = $(event.currentTarget).parent().siblings('input[type="hidden"]');
        let level = parseFloat(field.val());
        if (typeof level === undefined || level === 999) level = 0;

        const levels = [0, 3, 2]; //const levels = [0, 2, 3];

        let idx = levels.indexOf(level),
            newLevel = levels[(idx === levels.length - 1) ? 0 : idx + 1];

        let users = game.users.entities;

        let currentPermissions = duplicate(actorData.permission);
        for (let u of users) {
            if (u.data.role === 1 || u.data.role === 2) {
                currentPermissions[u._id] = newLevel;
            }
        }
        const lootPermissions = new PermissionControl(this.actor);
        lootPermissions._updateObject(event, currentPermissions)

        this._onSubmit(event);
    }

    _updatePermissions(actorData, playerId, newLevel, event) {
        // Read player permission on this actor and adjust to new level
        let currentPermissions = duplicate(actorData.permission);
        currentPermissions[playerId] = newLevel;
        // Save updated player permissions
        const lootPermissions = new PermissionControl(this.actor);
        lootPermissions._updateObject(event, currentPermissions);
    }



    /* -------------------------------------------- */


    /**
     * Get the font-awesome icon used to display the permission level.
     * @private
     */
    _getPermissionIcon(level) {
        const icons = {
            0: '<i class="far fa-circle"></i>',
            2: '<i class="fas fa-eye"></i>',
            3: '<i class="fas fa-check"></i>',
            999: '<i class="fas fa-users"></i>'
        };
        return icons[level];
    }

    /* -------------------------------------------- */

    /**
     * Get the font-awesome icon used to display the permission level.
     * @private
     */
    _getPermissionDescription(level) {
        const description = {
            0: "None (cannot access sheet)",
            2: "Observer (access to sheet but can only purchase items if merchant sheet type)",
            3: "Owner (can access items and share coins)",
            999: "Change all permissions"
        };
        return description[level];
    }


    /* -------------------------------------------- */

    /**
     * Prepares GM settings to be rendered by the loot sheet.
     * @private
     */
    _prepareGMSettings(actorData) {

        const players = [],
            observers = [];
        let users = game.users.entities;
        let commonPlayersPermission = -1;

        //console.log("Loot Sheet _prepareGMSettings | actorData.permission", actorData.permission);

        for (let u of users) {
            //console.log("Loot Sheet | Checking user " + u.data.name, u);

            //check if the user is a player 
            if (u.data.role === 1 || u.data.role === 2) {

                // get the name of the primary actor for a player
                const actor = game.actors.get(u.data.character);
                //console.log("Loot Sheet | Checking actor", actor);

                if (actor) {

                    u.actor = actor.data.name;
                    u.actorId = actor.data._id;
                    u.playerId = u.data._id;

                    //Check if there are default permissions to the actor
                    if (typeof actorData.permission.default !== "undefined") {

                        //console.log("Loot Sheet | default permissions", actorData.permission.default);

                        u.lootPermission = actorData.permission.default;

                        if (actorData.permission.default >= 2 && !observers.includes(actor.data._id)) {

                            observers.push(actor.data._id);
                        }

                    } else {

                        u.lootPermission = 0;
                        //console.log("Loot Sheet | assigning 0 permission to hidden field");
                    }

                    //if the player has some form of permission to the object update the actorData
                    if (u.data._id in actorData.permission && !observers.includes(actor.data._id)) {
                        //console.log("Loot Sheet | Found individual actor permission");

                        u.lootPermission = actorData.permission[u.data._id];
                        //console.log("Loot Sheet | assigning " + actorData.permission[u.data._id] + " permission to hidden field");

                        if (actorData.permission[u.data._id] >= 2) {
                            observers.push(actor.data._id);
                        }
                    }

                    //Set icons and permission texts for html
                    //console.log("Loot Sheet | lootPermission", u.lootPermission);
                    if (commonPlayersPermission < 0) {
                        commonPlayersPermission = u.lootPermission;
                    } else if (commonPlayersPermission !== u.lootPermission) {
                        commonPlayersPermission = 999;
                    }
                    u.icon = this._getPermissionIcon(u.lootPermission);
                    u.lootPermissionDescription = this._getPermissionDescription(u.lootPermission);
                    players.push(u);
                }
            }
        }

        let currencySplit
        let loot = {}
        loot.players = players;
        loot.observerCount = observers.length;
        loot.currency = currencySplit;
        loot.playersPermission = commonPlayersPermission;
        loot.playersPermissionIcon = this._getPermissionIcon(commonPlayersPermission);
        loot.playersPermissionDescription = this._getPermissionDescription(commonPlayersPermission);
        actorData.flags.loot = loot;
    }


}

//Register the loot sheet
Actors.registerSheet("dsa5", DSA5Merchants, {
    types: ["npc"],
    makeDefault: false
});


/**
 * Register a hook to convert any spell created on an actor with the DSA5Merchants sheet to a consumable scroll.
 */
Hooks.on('preCreateOwnedItem', (actor, item, data) => {

    console.log("Loot Sheet | actor", actor);
    console.log("Loot Sheet | item", item);
    console.log("Loot Sheet | data", data);

    if (!actor) throw new Error(`Parent Actor ${actor._id} not found`);

    // Check if Actor is an NPC
    if (actor.data.type === "character") return;

});


Hooks.once("init", () => {

    Handlebars.registerHelper('ifeq', function (a, b, options) {
        if (a == b) { return options.fn(this); }
        return options.inverse(this);
    });


    game.settings.register(MODULE_NAMESPACE, "buyChat", {
        name: "Display chat message for purchases?",
        hint: "If enabled, a chat message will display purchases of items from the loot sheet.",
        scope: "world",
        config: true,
        default: true,
        type: Boolean
    });

    game.settings.register(MODULE_NAMESPACE, "lootAll", {
        name: "Loot all?",
        hint: "If enabled, players will have the option to loot all items to their character, currency will follow the 'Loot Currency?' setting upon Loot All.",
        scope: "world",
        config: true,
        default: true,
        type: Boolean
    });

    game.settings.register(MODULE_NAMESPACE, "showStackWeight", {
        name: "Show Stack Weight?",
        hint: "If enabled, shows the weight of the entire stack next to the item weight",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });

    game.settings.register(MODULE_NAMESPACE, "reduceUpdateVerbosity", {
        name: "Reduce Update Shop Verbosity",
        hint: "If enabled, no notifications will be created every time an item is added to the shop.",
        scope: "world",
        config: true,
        default: true,
        type: Boolean
    });

    function chatMessage(speaker, owner, message, item) {
        if (game.settings.get(MODULE_NAMESPACE, "buyChat")) {
            message = `
            <div class="dnd5e chat-card item-card" data-actor-id="${owner._id}" data-item-id="${item._id}">
                <header class="card-header flexrow">
                    <img src="${item.img}" title="${item.name}" width="36" height="36">
                    <h3 class="item-name">${item.name}</h3>
                </header>

                <div class="message-content">
                    <p>` + message + `</p>
                </div>
            </div>
            `;
            ChatMessage.create({
                user: game.user._id,
                speaker: {
                    actor: speaker,
                    alias: speaker.name
                },
                content: message
            });
        }
    }


    function errorMessageToActor(target, message) {
        game.socket.emit(DSA5Merchants.SOCKET, {
            type: "error",
            targetId: target.id,
            message: message
        });
    }

    async function moveItems(source, destination, items) {
        const updates = [];
        const deletes = [];
        const additions = [];
        const destUpdates = [];
        const results = [];
        for (let i of items) {
            let itemId = i.itemId;
            let quantity = i.quantity;
            let item = source.getEmbeddedEntity("OwnedItem", itemId);

            // Move all items if we select more than the quantity.
            if (item.data.quantity < quantity) {
                quantity = item.data.quantity;
            }

            let newItem = duplicate(item);
            const update = { _id: itemId, "data.quantity": item.data.quantity - quantity };

            if (update["data.quantity"] === 0) {
                deletes.push(itemId);
            }
            else {
                updates.push(update);
            }

            newItem.data.quantity = quantity;
            results.push({
                item: newItem,
                quantity: quantity
            });
            let destItem = destination.data.items.find(i => i.name == newItem.name);
            if (destItem === undefined) {
                additions.push(newItem);
            } else {
                //console.log("Existing Item");
                destItem.data.quantity = Number(destItem.data.quantity) + Number(newItem.data.quantity);
                destUpdates.push(destItem);
            }
        }

        if (deletes.length > 0) {
            await source.deleteEmbeddedEntity("OwnedItem", deletes);
        }

        if (updates.length > 0) {
            await source.updateEmbeddedEntity("OwnedItem", updates);
        }

        if (additions.length > 0) {
            await destination.createEmbeddedEntity("OwnedItem", additions);
        }

        if (destUpdates.length > 0) {
            await destination.updateEmbeddedEntity("OwnedItem", destUpdates);
        }

        return results;
    }


    async function transaction(seller, buyer, itemId, quantity) {
        let sellItem = seller.getEmbeddedEntity("OwnedItem", itemId);

        // If the buyer attempts to buy more then what's in stock, buy all the stock.
        if (sellItem.data.quantity < quantity) {
            quantity = sellItem.data.quantity;
        }

        // On negative quantity we show an error
        if (quantity < 0) {
            errorMessageToActor(buyer, `Can not buy negative amounts of items.`);
            return;
        }

        // On 0 quantity skip everything to avoid error down the line
        if (quantity == 0) {
            return;
        }

        let sellerModifier = seller.getFlag(MODULE_NAMESPACE, "priceModifier");
        if (!sellerModifier) sellerModifier = 1.0;

        let itemCostInGold = Math.round(sellItem.data.price * sellerModifier * 100) / 100;

        itemCostInGold *= quantity;


        /*
        Todo use Payment from DSA5 to request money
        */



        let moved = await moveItems(seller, buyer, [{ itemId, quantity }]);

        for (let m of moved) {
            chatMessage(
                seller, buyer,
                `${buyer.name} purchases ${quantity} x ${m.item.name} for ${itemCostInGold}gp.`,
                m.item);
        }
    }



    game.socket.on(DSA5Merchants.SOCKET, data => {
        console.log("Loot Sheet | Socket Message: ", data);
        if (game.user.isGM && data.processorId === game.user.id) {
            if (data.type === "buy") {
                let buyer = game.actors.get(data.buyerId);
                let seller = canvas.tokens.get(data.tokenId);

                if (buyer && seller && seller.actor) {
                    transaction(seller.actor, buyer, data.itemId, data.quantity);
                }
                else if (!seller) {
                    errorMessageToActor(buyer, "GM not available, the GM must on the same scene to purchase an item.")
                    ui.notifications.error("Player attempted to purchase an item on a different scene.");
                }
            }

        }
        if (data.type === "error" && data.targetId === game.user.actorId) {
            console.log("Loot Sheet | Transaction Error: ", data.message);
            return ui.notifications.error(data.message);
        }
    });


});

