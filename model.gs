// Global namespace for OpenSolver
var OpenSolver = OpenSolver || {};

OpenSolver.Model = function(sheet) {
  if (!sheet) {
    return null;
  }
  this.sheet = sheet;
  this.constraints = [];
  this.variables = [];
  this.objective = new OpenSolver.MockRange([[0]]);  // empty objective cell that returns value zero
  this.objectiveSense = OpenSolver.consts.objectiveSenseType.MINIMISE;
  this.objectiveVal = 0;
  this.assumeNonNeg = true;
  this.showStatus = false;
  this.checkLinear = true;
};

OpenSolver.Model.prototype.saveConstraint = function(lhs, rhs, rel, index) {
  try {
    var lhsRange = this.sheet.getRange(lhs);
  } catch (e) {
    OpenSolver.util.showMessage(e.message);
    return;
  }

  if (OpenSolver.util.getRangeSize(lhsRange) === 0) {
    OpenSolver.util.showError(OpenSolver.error.LHS_NO_CELLS);
    return;
  }

  var rhsRange;
  switch (rel) {
    case OpenSolver.consts.relation.INT:
      rhs = 'integer';
      break;
    case OpenSolver.consts.relation.BIN:
      rhs = 'binary';
      break;
    case OpenSolver.consts.relation.ALLDIFF:
      rhs = 'alldiff';
      break;
    default:
      try {
        rhsRange = this.sheet.getRange(rhs);
      } catch (e) {
        OpenSolver.util.showMessage(e.message);
        return;
      }

      // Make sure range is compatible with LHS
      var lhsDims = OpenSolver.util.getRangeDims(lhsRange);
      var rhsDims = OpenSolver.util.getRangeDims(rhsRange);

      // Check for a RHS of size 1 or matching RHS and LHS dimensions
      if (!((OpenSolver.util.getRangeSize(rhsRange) === 1) ||
            (lhsDims.rows === rhsDims.rows && lhsDims.cols === rhsDims.cols) ||
            (lhsDims.cols === rhsDims.rows && lhsDims.rows === rhsDims.cols))) {
        OpenSolver.util.showError(OpenSolver.error.RHS_WRONG_SIZE);
        return;
      }
      break;
  }

  // If no RHS, we have a INT/BIN/ALLDIFF constraint.
  // We need to check that the LHS is all decision variables.
  if (!rhsRange) {
    valid = false;
    for (var i = 0; i < this.variables.length; i++) {
      var varRange = this.sheet.getRange(this.variables[i]);
      var intersectRange = OpenSolver.util.getRangeIntersect(lhsRange, varRange);
      if (intersectRange &&
          OpenSolver.util.getRangeSize(intersectRange) === OpenSolver.util.getRangeSize(lhsRange)) {
        valid = true;
        break;
      }
    }

    if (!valid) {
      OpenSolver.util.showError(OpenSolver.error.LHS_NOT_DECISION_VARS);
      return;
    }
  }

  var constraint = new OpenSolver.Constraint(lhs, rhs, rel);
  if (index === 0) {
    this.constraints.push(constraint);
  } else {
    this.constraints[index - 1] = constraint;
  }
  OpenSolver.updateSavedConstraints(this.constraints);

  return {
    text: constraint.displayText(),
    value: constraint.displayValue(),
    index: index
  };
};

OpenSolver.Model.prototype.deleteConstraint = function(index) {
  this.constraints.splice(index, 1);
  OpenSolver.updateSavedConstraints(this.constraints);
};

OpenSolver.loadModel = function(sheet) {
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSheet();
  }

  var properties = OpenSolver.util.getAllProperties();
  var model = new OpenSolver.Model(sheet);

  if (properties['solver_num']) {
    for (var i = 0; i < properties['solver_num']; i++) {
      var lhs = properties['solver_lhs'.concat(i)];
      var rhs = properties['solver_rhs'.concat(i)];
      var rel = parseInt(properties['solver_rel'.concat(i)]);
      model.constraints.push(new OpenSolver.Constraint(lhs, rhs, rel));
    }
  }

  if (properties['solver_adj'] !== undefined) {
    model.variables = properties['solver_adj'].split(',');
  }

  if (properties['solver_opt'] !== undefined) {
    model.objective = sheet.getRange(properties['solver_opt']);
  }

  if (properties['solver_typ'] !== undefined) {
    model.objectiveSense = properties['solver_typ'];
  } else {
    model.updateObjectiveSense(model.objectiveSense);
  }

  if (properties['solver_val'] !== undefined) {
    model.objectiveVal = properties['solver_val'];
  }

  if (properties['solver_neg'] !== undefined) {
    model.assumeNonNeg = OpenSolver.util.assumeNonNegToBoolean(properties['solver_neg']);
  }

  if (properties['openSolver_showStatus'] !== undefined) {
    model.showStatus = (properties['openSolver_showStatus'] === 'true');
  }

  if (properties['openSolver_checkLinear'] !== undefined) {
    model.checkLinear = (properties['openSolver_checkLinear'] === 'true');
  }
  return model;
};

OpenSolver.Model.prototype.updateObjective = function() {
  try {
    var objRange = this.sheet.getActiveRange();
  } catch (e) {
    OpenSolver.util.showMessage(e.message);
    return;
  }

  // Make sure objective cell is a single cell
  if (objRange.getNumColumns() !== 1 || objRange.getNumRows() !== 1) {
    OpenSolver.util.showError(OpenSolver.error.OBJ_NOT_SINGLE_CELL);
    return;
  }

  this.objective = objRange;
  OpenSolver.updateSavedObjective(this.objective);
  return this.objective.getA1Notation();
};

OpenSolver.Model.prototype.deleteObjective = function() {
  this.objective = new OpenSolver.MockRange([[0]]);
  OpenSolver.updateSavedObjective(this.objective);
};

OpenSolver.Model.prototype.updateObjectiveSense = function(objSense) {
  this.objectiveSense = objSense;
  OpenSolver.updateSavedObjectiveSense(this.objectiveSense);
};

OpenSolver.Model.prototype.updateObjectiveTarget = function(objVal) {
  this.objectiveVal = objVal;
  OpenSolver.updateSavedObjectiveTarget(this.objectiveVal);
};

OpenSolver.Model.prototype.addVariable = function() {
  return this.updateVariable(-1);
};

OpenSolver.Model.prototype.updateVariable = function(index) {
  try {
    var varRange = this.sheet.getActiveRange();
  } catch (e) {
    OpenSolver.util.showMessage(e.message);
    return;
  }
  var varString = varRange.getA1Notation();
  if (index >= 0) {
    this.variables[index] = varString;
  } else {
    this.variables.push(varString);
  }
  OpenSolver.updateSavedVariables(this.variables);
  return varString;
};

OpenSolver.Model.prototype.deleteVariable = function(index) {
  this.variables.splice(index, 1);
  OpenSolver.updateSavedVariables(this.variables);
};

OpenSolver.Model.prototype.updateAssumeNonNeg = function(nonNeg) {
  this.assumeNonNeg = nonNeg;
  OpenSolver.updateSavedAssumeNonNeg(this.assumeNonNeg);
};

OpenSolver.Model.prototype.updateShowStatus = function(showStatus) {
  this.showStatus = showStatus;
  OpenSolver.updateSavedShowStatus(this.showStatus);
};

OpenSolver.Model.prototype.updateCheckLinear = function(checkLinear) {
  this.checkLinear = checkLinear;
  OpenSolver.updateSavedCheckLinear(this.checkLinear);
};

OpenSolver.Model.prototype.getSidebarData = function() {
  return {
    constraints: this.constraints.map(function(constraint) {
      return {
        text: constraint.displayText(),
        value: constraint.displayValue()
      };
    }),
    variables: this.variables,
    objective: this.objective.getA1Notation(),
    objectiveVal: this.objectiveVal,
    objectiveSense: this.objectiveSense,
    disableVal: this.objectiveSense != OpenSolver.consts.objectiveSenseType.TARGET,
    assumeNonNeg: this.assumeNonNeg,
    showStatus: this.showStatus,
    checkLinear: this.checkLinear,
  };
}

