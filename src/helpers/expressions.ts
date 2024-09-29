import jsonata from 'jsonata';
import type { Expression } from 'jsonata';

export const getKitTransformer: Expression = jsonata(`
    (
      $actionsMap := actions{
        id: {'description': description, 'mapping': mapping}
      };

      $kitStatus := $getKitStatus($kitId);

      $calcStatus := function($children){(
        $count($children[metadata.status = 'in-progress']) > 0 ? 'in-progress' : (
          $count($children[metadata.status = 'skipped']) = $count($children) ? 'skipped' : (
            $count($children[metadata.status in ['skipped','completed','passed','failed','error']]) = $count($children) ? 'completed' : (
              $count($children[metadata.status in ['skipped','ready']]) = $count($children) ? 'ready' : 'unknown'
            )
          )
        )
      )};
  
      $kitTree := kits[id=$kitId].{
        'children': children.{
          'id': id,
          'name': name,
          'metadata': {
            'description': description,
            'status': $kitStatus
          },
          'children': children.{
            'id': id,
            'name': name,
            'metadata': {
              'status': 'ready'
            },
            'children': children.{
              'id': id,
              'name': name,
              'metadata': {
                'Test Name': name,
                'Description': description,
                'status': $getTestStatus(id),
                'Details': details,
                'Actions': '\n' & (actions#$i.(
                  $string($i + 1) & '. ' & $lookup($actionsMap, $).description & ' (' & $getActionStatus($lookup($actionsMap, $).mapping).statusText & ')'
                ) ~> $join( '\n'))
              }
            }[]
          }[]
        }[]
      };
      $kitTree := $kitTree ~> |children.children|{'metadata': {'status': $calcStatus(children)}}|;
      $kitTree := $kitTree ~> |children|{'metadata': {'status': $calcStatus(children)}}|;
    )
  `);

export const getKitsTransformer: Expression = jsonata(`
    {
      'kits': kits.{
        'id': id,
        'name': name,
        'description': description,
        'status': $getKitStatus(id)
      }[]
    }`
);

export const runWorkflowTransformer: Expression = jsonata(`
      {
        'timestamp': $fromMillis($millis(), '[Y0000]-[M00]-[D00]_[H00][m00][s00]'),
        'kitId': $kitId,
        'tests': kits[id = $kitId].children.children.children.{
          'testId': id,
          'skipped': $not(id in $selectedTests)
        }[]
      }
    `
);

export const getSelectedTests: Expression = jsonata(`
    tests[skipped=false].testId[]
  `
);

export const getSkippedTests: Expression = jsonata(`
  tests[skipped=true].testId[]
`
);

export const getTestActions: Expression = jsonata(`
    $kits.kits.children.children.children[id=$testId].actions.(
      $actionId := $;
      $kits.actions[id=$actionId].mapping
    )[]
  `
);

export const runTestListExpr: Expression = jsonata('$testList.$runTest($)');

export const runActionListExpr: Expression = jsonata('$actionList.$runAction($)');

export const validateTree: Expression = jsonata(`
    (
      $missingActions := kits.children.children.children.actions@$actId.{
        'actionId': $actId,
        'testId': %.id,
        'actionExists': $exists(%.%.%.%.%.actions[id=$actId])
      }[actionExists=false].{'test': testId, 'action': actionId};

      $count($missingActions) > 0 ? $error('Some tests reference actions that are not defined!\n' & $string($missingActions, true))
    )
  `
);

export const addMockKit: Expression = jsonata(`(
  $mockActions := [
    {
      "id": "wait1s",
      "description": "Wait 1 second and then success",
      "mapping": "mockAction1s"
    },
    {
      "id": "wait1f",
      "description": "Wait 1 second and then fail",
      "mapping": "mockAction1f"
    },
    {
      "id": "wait1e",
      "description": "Wait 1 second and then error",
      "mapping": "mockAction1e"
    },
    {
      "id": "wait10s",
      "description": "Wait 10 seconds and then success",
      "mapping": "mockAction10s"
    },
    {
      "id": "wait10f",
      "description": "Wait 10 seconds and then fail",
      "mapping": "mockAction10f"
    },
    {
      "id": "wait10e",
      "description": "Wait 10 seconds and then error",
      "mapping": "mockAction10e"
    }
  ];
  $allActions := $append($kits.actions, $mockActions);
  $mockKit := {
    "id": "mock-kit",
    "name": "Mock Kit",
    "description": "This kit contains mock tests and actions. It's purpose is to test behaviour of the orchestrator and UI",
    "children": [
      {
        "id": "should-pass",
        "name": "Tests That Pass",
        "children": [
          {
            "id": "passing-tests1",
            "name": "Passing Tests 1",
            "children": [
              {
                "id": "passing-test1",
                "name": "passing test 1",
                "actions": ["wait1s"]
              },
              {
                "id": "passing-test2",
                "name": "passing test 2",
                "actions": ["wait10s"]
              }
            ]
          },
          {
            "id": "passing-tests2",
            "name": "Passing Tests 2",
            "children": [
              {
                "id": "passing-test3",
                "name": "passing test 3",
                "actions": ["wait10f", "wait10s"]
              },
              {
                "id": "passing-test4",
                "name": "passing test 4",
                "actions": ["wait1e", "wait10s"]
              }
            ]
          }
        ]
      },
      {
        "id": "should-fail",
        "name": "Tests That Fail",
        "children": [
          {
            "id": "failing-tests1",
            "name": "failing Tests 1",
            "children": [
              {
                "id": "failing-test1",
                "name": "failing test 1",
                "actions": ["wait10f", "wait1f"]
              },
              {
                "id": "failing-test2",
                "name": "failing test 2",
                "actions": ["wait1f", "wait10s", "wait10f"]
              }
            ]
          }
        ]
      },
      {
        "id": "should-error",
        "name": "Tests That Throw Errors",
        "children": [
          {
            "id": "error-tests1",
            "name": "error Tests 1",
            "children": [
              {
                "id": "error-test1",
                "name": "error test 1",
                "actions": ["wait10f", "wait1e"]
              },
              {
                "id": "error-test2",
                "name": "error test 2",
                "actions": ["wait1e", "wait10f", "wait10e"]
              }
            ]
          }
        ]
      }
    ]
  };
  $allKits := $append($kits.kits, $mockKit);
  {
    'actions': $allActions,
    'kits': $allKits
  }
)`);
