var gencode = require('gencode');
var data = require('./data.json');

var clean = [];
var tablas = [];
var folder_output;

exports.generate = function(route, output, format, cb) {

	folder_output = output;
	gencode.utils.toArray(route, format, '\n').then((value) => { //Too: \n, \t, -, etc.
		var allData = "";
		var tables = [],
			dataValid = [];
		value.map((item) => {
			item = item.toString().trim().toLowerCase();

			if (!isComment(item)) {
				allData += item;
			}
		});
		var splits = allData.split(";");
		for (var i = 0; i < splits.length; i++) {
			if (isValid(splits[i])) {
				dataValid.push(splits[i]);
			}
		}

		for (var i = 0; i < dataValid.length; i++) {
			if (dataValid[i].toString().toLowerCase().trim().startsWith('create table')) {
				tables.push(verifyContains(dataValid[i].toString()));
			}
		}
		getTablesJSON(tables);
	}, (error) => {
		console.log("ERROR=>", error);
	});
}

function verifyContains(item) {
	var result = "";
	var state = true;
	var start, end = 0;
	var add;
	for (var i = 0; i < data.contains.length; i++) {
		result = "";
		state = true;
		while (state) {
			start = item.indexOf(data.contains[i]);
			if (start != -1) {
				end = item.substring(start, item.length).indexOf(")") + start;
				result += item.substring(0, start);
				add = item.substring(start, end);
				while (add.indexOf(",") != -1) {
					add = add.replace(",", "-");
				}
				result += add;
				item = item.substring(end, item.length);
			} else {
				state = false;
			}
		}
		result += item;
		item = result;
	}
	return result;
}

function cleanItem(item) {
	var line = item;
	for (var i = 0; i < data.start.length; i++) {
		if (item.startsWith(data.start[i])) {
			line = item.substring(data.start[i].length + 1, item.length);
			break;
		}
	}
	return line;
}

function getTableName(item) {
	var firstLine = item.indexOf('(');
	var name = item.substring(0, firstLine).trim().replace('`', '').replace('`', '');
	return name;
}

function isAtribute(line) {
	for (var j = 0; j < data.attr.length; j++) {
		if (line.toString().trim().startsWith(data.attr[j])) {
			return false;
		}
	}
	return true;
}

function getAtributes(item) {
	var attrLines = item.indexOf('(');
	item = item.substring(attrLines + 1, item.length);
	var atributes = [];
	var lines = item.split(',');
	var split;
	for (var i = 0; i < lines.length; i++) {
		lines[i] = lines[i].replace("not null", "not_null");
		if (isAtribute(lines[i])) {

			split = lines[i] != "" ? lines[i].split(" ") : "";
			atributes.push({
				Name: getValue(0, split),
				Type: getValue(1, split),
				Size: getValue(2, split),
				NotNull: split.length > 2,
				AI: split.length > 3,
			})
		}
	}
	return atributes;
}

function getValue(pos, values) {
	var result = "";

	switch (pos) {
		case 0:
			result = values[pos].replace('`', '').replace('`', '');
			break;
		case 1:
			var val = values[pos];
			if (!val.startsWith("enum")) {
				var start = val.indexOf("(");
				result = start == -1 ? val : val.substring(0, start);
			} else {
				result = val;
			}
			break;
		case 2:
			var val = values[1];
			if (!val.startsWith("enum")) {
				var start = val.indexOf("(");
				result = start == -1 ? "" : val.substring(start + 1, val.indexOf(")"));
			} else {
				result = "";
			}
			break;
		default:
	}
	return result;
}

function getTablesJSON(tables) {
	var tablesJSON = [];
	var item, line;
	for (var i = 0; i < tables.length; i++) {
		item = tables[i].toString().toLowerCase();
		tables[i] = cleanItem(item);

		tablesJSON.push({
			table_name: getTableName(tables[i]),
			atr: getAtributes(tables[i])
		})
	}

	//console.log(JSON.stringify(tablesJSON, null, 4));
	convertModels(tablesJSON);
}

function isComment(line) {
	return line.trim().startsWith('--');
}

function isValid(line) {
	if (line != "") {
		for (var i = 0; i < data.ignore.length; i++) {
			if (line.startsWith(data.ignore[i])) {
				return false;
			}
		}
	} else {
		return false;
	}
	return true;
}

//Export models
function returnType(type) {
	var res = type;
	if (type.startsWith("enum")) {
		res = "bool";
	} else if (type.startsWith("text") || type.startsWith("date") || type.startsWith("varchar")) {
		res = "string";
	} else if (type == "bigint") {
		res = "long";
	}
	return res;
}

function convertModels(tables, callback) {
	var type = "",
		parameters = "",
		constructor = "";
	var name;
	var data = [];

	for (var i = 0; i < tables.length; i++) {
		name = tables[i].table_name;
		data = ["using System;", "using System.Collections.Generic;", "using System.Data;", "namespace Models{"];
		data.push("public class " + name + "{");
		for (var j = 0; j < tables[i].atr.length; j++) {
			type = returnType(tables[i].atr[j].Type);
			data.push("public " + type + " " + tables[i].atr[j].Name + " { get; set; }")

			parameters += type + " " + tables[i].atr[j].Name;
			parameters += j < tables[i].atr.length - 1 ? "," : "";
			constructor += "this." + tables[i].atr[j].Name + " = " + tables[i].atr[j].Name + ";";
		}

		data.push("public " + name + " (){}");
		data.push("public " + name + " (" + parameters + "){");
		data.push(constructor);
		data.push("}");
		data.push(select(tables[i]));
		data.push(insert(tables[i]));
		data.push(update(tables[i]));
		data.push("}}");

		gencode.toFile(data, folder_output, name + ".cs", '\n').then((value) => {
			console.log("Result: Model generated succesfully");
			/* Result: successfull */
		}, function(err) {
			console.log("Error: ", err);
		});
		data = [];
		parameters = "";
		constructor = "";
	}
}

function select(table) {
	var result = "public DataTable get_" + table.table_name + "(){";
	result += ("string sql = |SELECT * FROM " + table.table_name + "|;").replace('|', '"').replace('|', '"');
	result += "return Connection.ExecuteSelect(sql, System.Data.CommandType.Text);";
	result += "}";
	return result;
}

function insert(table) {
	var atributes = "",
		values = "",
		list = "";
	var cont = 0;
	for (var i = 0; i < table.atr.length; i++) {
		if (!table.atr[i].AI) {
			atributes += table.atr[i].Name;
			values += "{" + cont + "}";
			list += "obj." + table.atr[i].Name;
			atributes += i < table.atr.length - 1 ? "," : "";
			values += i < table.atr.length - 1 ? "," : "";
			list += i < table.atr.length - 1 ? "," : "";
			cont++;
		}
	}
	var result = "public bool insert_" + table.table_name + "(" + table.table_name + " obj ){";
	result += ("string sql = |INSERT INTO " + table.table_name + " (" + atributes + ") VALUES (" + values + ")|;").replace('|', '"').replace('|', '"');
	result += "string[] ar = new string[1];";
	result += "ar[0] = string.Format(sql, " + list + ");"
	result += "return Connection.ExecuteTransaction(ar);";
	result += "}";
	atributes = "";
	values = "";
	list = "";
	return result;
}

function update(table) {
	var atributes = "",
		pk = "",
		list = "";
	var cont = 0;
	for (var i = 0; i < table.atr.length; i++) {
		if (!table.atr[i].AI) {
			atributes += table.atr[i].Name + " = {" + cont + "}";
			list += "obj." + table.atr[i].Name;
			atributes += i < table.atr.length - 1 ? ", " : "";
			list += i < table.atr.length - 1 ? ", " : "";
			cont++;
		}
	}
	atributes += " WHERE " + table.atr[0].Name + " = {0}";
	var result = "public bool update_" + table.table_name + "(" + table.table_name + " obj ){";
	result += ("string sql = |UPDATE " + table.table_name + " SET " + atributes + "|;").replace('|', '"').replace('|', '"');
	result += "string[] ar = new string[1];";
	result += "ar[0] = string.Format(sql, " + list + ");"
	result += "return Connection.ExecuteTransaction(ar);";
	result += "}";
	atributes = "";
	list = "";
	return result;
}
