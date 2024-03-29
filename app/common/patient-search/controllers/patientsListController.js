'use strict';

angular.module('bahmni.common.patientSearch')
.controller('PatientsListController', ['$scope', '$window', 'patientService', '$rootScope', 'appService', 'spinner',
    '$stateParams', '$bahmniCookieStore', 'printer', 'configurationService',
    function ($scope, $window, patientService, $rootScope, appService, spinner, $stateParams, $bahmniCookieStore, printer, configurationService) {
        var initialize = function () {
            var searchTypes = appService.getAppDescriptor().getExtensions("org.bahmni.patient.search", "config").map(mapExtensionToSearchType);
            $scope.search = new Bahmni.Common.PatientSearch.Search(_.without(searchTypes, undefined));
            $scope.search.markPatientEntry();
            $scope.$watch('search.searchType', function (currentSearchType) {
                _.isEmpty(currentSearchType) || fetchPatients(currentSearchType);
            });
            _.each($scope.search.searchTypes, function (searchType) {
                _.isEmpty(searchType) || ($scope.search.searchType != searchType && getPatientCount(searchType));
            });
            if ($rootScope.currentSearchType != null) {
                $scope.search.switchSearchType($rootScope.currentSearchType);
            }
            configurationService.getConfigurations(['identifierTypesConfig']).then(function (response) {
                $scope.primaryIdentifier = _.find(response.identifierTypesConfig, {primary: true}).name;
            });
        };

        $scope.searchPatients = function () {
            return spinner.forPromise(patientService.search($scope.search.searchParameter)).then(function (response) {
                $scope.search.updateSearchResults(response.data.pageOfResults);
                if ($scope.search.hasSingleActivePatient()) {
                    $scope.forwardPatient($scope.search.activePatients[0]);
                }
            });
        };

        $scope.filterPatientsAndSubmit = function () {
            if ($scope.search.searchResults.length == 1) {
                $scope.forwardPatient($scope.search.searchResults[0]);
            }
        };
        var getPatientCount = function (searchType) {
            if (searchType.handler) {
                var params = { q: searchType.handler, v: "full",
                    location_uuid: $bahmniCookieStore.get(Bahmni.Common.Constants.locationCookieName).uuid,
                    provider_uuid: $rootScope.currentProvider.uuid };
                if (searchType.additionalParams) {
                    params["additionalParams"] = searchType.additionalParams;
                }
                patientService.findPatients(params).then(function (response) {
                    var count = 0;
                    searchType.patientCount = response.data.length;
                    angular.forEach(response.data, function (value, key) {
                        patientService.getPatient(value.uuid).then(function (result) {
                            count++;
                            $scope.patientDetails = result.data.person.attributes;
                            angular.forEach(response.data, function (value, key) {
                                if (value.uuid == result.data.person.uuid) {
                                    value.patientAttributes = $scope.patientDetails;
                                }
                            });
                            if (count == searchType.patientCount) {
                                if ($scope.search.isSelectedSearch(searchType)) {
                                    $scope.search.updatePatientList(response.data);
                                }
                            }
                        });
                    });
                });
            }
        };

        $scope.filteringAttributes = function (item) {
            if (item.attributeType.display == "Token") {
                return item;
            }
        };

        $scope.getHeadings = function (patients) {
            if (patients && patients.length > 0) {
                var headings = _.chain(patients[0])
                    .keys()
                    .filter(function (heading) {
                        return _.indexOf(Bahmni.Common.PatientSearch.Constants.tabularViewIgnoreHeadingsList, heading) === -1;
                    })
                    .value();

                return headings;
            }
            return [];
        };
        $scope.isHeadingOfLinkColumn = function (heading) {
            var identifierHeading = _.includes(Bahmni.Common.PatientSearch.Constants.identifierHeading, heading);
            if (identifierHeading) {
                return identifierHeading;
            } else if ($scope.search.searchType && $scope.search.searchType.links) {
                return _.find($scope.search.searchType.links, {linkColumn: heading});
            }
            else if ($scope.search.searchType && $scope.search.searchType.linkColumn) {
                return _.includes([$scope.search.searchType.linkColumn], heading);
            }
        };
        $scope.isHeadingOfName = function (heading) {
            return _.includes(Bahmni.Common.PatientSearch.Constants.nameHeading, heading);
        };
        $scope.getPrintableHeadings = function (patients) {
            var headings = $scope.getHeadings(patients);
            var printableHeadings = headings.filter(function (heading) {
                return _.indexOf(Bahmni.Common.PatientSearch.Constants.printIgnoreHeadingsList, heading) === -1;
            });
            return printableHeadings;
        };
        $scope.printPage = function () {
            if ($scope.search.searchType.printHtmlLocation != null) {
                printer.printFromScope($scope.search.searchType.printHtmlLocation, $scope);
            }
        };

        var mapExtensionToSearchType = function (appExtn) {
            return {
                name: appExtn.label,
                display: appExtn.extensionParams.display,
                handler: appExtn.extensionParams.searchHandler,
                forwardUrl: appExtn.extensionParams.forwardUrl,
                id: appExtn.id,
                params: appExtn.extensionParams.searchParams,
                refreshTime: appExtn.extensionParams.refreshTime || 0,
                view: appExtn.extensionParams.view || Bahmni.Common.PatientSearch.Constants.searchExtensionTileViewType,
                showPrint: appExtn.extensionParams.showPrint || false,
                printHtmlLocation: appExtn.extensionParams.printHtmlLocation || null,
                additionalParams: appExtn.extensionParams.additionalParams,
                searchColumns: appExtn.extensionParams.searchColumns,
                translationKey: appExtn.extensionParams.translationKey,
                linkColumn: appExtn.extensionParams.linkColumn,
                links: appExtn.extensionParams.links
            };
        };

        var fetchPatients = function (currentSearchType) {
            $rootScope.currentSearchType = currentSearchType;
            if ($scope.search.isCurrentSearchLookUp()) {
                getPatientCount(currentSearchType);
            }
        };

        $scope.forwardPatient = function (patient, heading) {
            var options = $.extend({}, $stateParams);
            $rootScope.patientAdmitLocationStatus = patient.Status;
            $.extend(options, {
                patientUuid: patient.uuid,
                visitUuid: patient.activeVisitUuid || null,
                encounterUuid: $stateParams.encounterUuid || 'active',
                programUuid: patient.programUuid || null,
                enrollment: patient.enrollment || null,
                forwardUrl: patient.forwardUrl || null,
                dateEnrolled: patient.dateEnrolled || null
            });
            var link = options.forwardUrl ? {
                url: options.forwardUrl,
                newTab: true
            } : {url: $scope.search.searchType.forwardUrl, newTab: false};
            if ($scope.search.searchType.links) {
                link = _.find($scope.search.searchType.links, {linkColumn: heading}) || link;
            }
            if (link.url && link.url !== null) {
                $window.open(appService.getAppDescriptor().formatUrl(link.url, options, true), link.newTab ? "_blank" : "_self");
            }
        };
        initialize();
    }
]);
